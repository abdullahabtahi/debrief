import { z } from 'zod'
import { getSupabase } from '@/lib/supabase'
import { createDebriefAgent, type DebriefOutput } from '@/agents/debrief'
import { verifyDebriefEvidence } from '@/lib/verifyEvidence'
import { rateLimit, getClientIp, tooManyRequests } from '@/lib/rateLimit'

// ── Zod schemas ───────────────────────────────────────────────────────────────

const PostBodySchema = z.object({
  session_id: z.string().uuid(),
})

const DebriefOutputSchema = z.object({
  verdict: z.string(),
  fracture_map: z.object({
    vc:             z.object({ score: z.number(), top_concern: z.string() }),
    domain_expert:  z.object({ score: z.number(), top_concern: z.string() }),
    user_advocate:  z.object({ score: z.number(), top_concern: z.string() }),
    overall_score:  z.number(),
  }),
  strengths:         z.array(z.object({ title: z.string(), explanation: z.string() })),
  weaknesses:        z.array(z.object({ title: z.string(), explanation: z.string() })),
  narrative_issues:  z.array(z.object({ title: z.string(), evidence: z.string(), recommendation: z.string(), persona: z.string().nullable().optional() })),
  delivery_issues:   z.array(z.object({ title: z.string(), evidence: z.string(), recommendation: z.string(), persona: z.string().nullable().optional() })),
  qa_vulnerabilities:z.array(z.object({ title: z.string(), evidence: z.string(), recommendation: z.string(), persona: z.string().nullable().optional() })),
  next_drill: z.string(),
})

// ── Coach opening prompt generation ─────────────────────────────────────────
// Deterministic — no extra LLM call. Derived from fracture map + qa_vulnerabilities.
function generateCoachOpeningPrompts(output: DebriefOutput): string[] {
  const axes = [
    { key: 'VC',            score: output.fracture_map.vc.score,            concern: output.fracture_map.vc.top_concern },
    { key: 'Domain Expert', score: output.fracture_map.domain_expert.score, concern: output.fracture_map.domain_expert.top_concern },
    { key: 'User Advocate', score: output.fracture_map.user_advocate.score, concern: output.fracture_map.user_advocate.top_concern },
  ].sort((a, b) => a.score - b.score)

  const [lowest, second] = axes
  const vuln = output.qa_vulnerabilities[0]

  const chip1 = `The ${lowest.key} flagged: "${lowest.concern}" — how do I fix this?`
  const chip2 = second.concern !== lowest.concern
    ? `The ${second.key} flagged: "${second.concern}" — what's the root cause?`
    : `How do I bring my ${second.key} score up from ${second.score}/10?`
  const chip3 = vuln
    ? `What went wrong when the judge asked about "${vuln.title}"?`
    : `How do I strengthen my overall narrative?`

  return [chip1, chip2, chip3]
}

// ── SSE helpers ───────────────────────────────────────────────────────────────

function sseEvent(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

// ── GET /api/debrief?session_id= ──────────────────────────────────────────────

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const session_id = searchParams.get('session_id')

  if (!session_id || !/^[0-9a-f-]{36}$/.test(session_id)) {
    return Response.json({ error: { code: 'INVALID_INPUT', message: 'session_id is required' } }, { status: 400 })
  }

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('debriefs')
    .select('id, output, debrief_progress, coach_opening_prompts, status, attempt_number, created_at, qa_session_id')
    .eq('session_id', session_id)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    return Response.json({ error: { code: 'DB_ERROR', message: error.message } }, { status: 500 })
  }

  if (!data) {
    return Response.json({ debrief: null })
  }

  // Validate output JSONB if complete — on schema mismatch keep raw data rather than discarding it
  let validatedOutput: DebriefOutput | null = null
  if (data.status === 'complete' && data.output) {
    const parsed = DebriefOutputSchema.safeParse(data.output)
    if (parsed.success) {
      validatedOutput = parsed.data as DebriefOutput
    } else {
      console.warn('[debrief GET] output schema mismatch — returning raw', parsed.error.issues.map(i => i.path.join('.')))
      validatedOutput = data.output as DebriefOutput
    }
  }

  // debrief_progress is {} when empty — only use it if validatedOutput is null
  const progressOutput = data.debrief_progress && Object.keys(data.debrief_progress).length > 0
    ? data.debrief_progress
    : null

  return Response.json({
    debrief: {
      ...data,
      output: validatedOutput ?? progressOutput ?? null,
      coach_opening_prompts: data.coach_opening_prompts ?? null,
    },
  })
}

// ── POST /api/debrief ─────────────────────────────────────────────────────────

export async function POST(req: Request) {  const ip = getClientIp(req)
  const rl = rateLimit(`debrief:${ip}`, 5, 300) // 5 debriefs / 5 min / IP
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec)
  const body = await req.json().catch(() => null)
  const parsed = PostBodySchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: { code: 'INVALID_INPUT', message: parsed.error.issues[0].message } }, { status: 400 })
  }
  const { session_id } = parsed.data
  const supabase = getSupabase()

  // 1. Verify session state
  const { data: session } = await supabase
    .from('sessions')
    .select('id, state')
    .eq('id', session_id)
    .single()

  if (!session || !['qa_completed', 'debrief_ready', 'completed'].includes(session.state)) {
    return Response.json({ error: { code: 'INVALID_STATE', message: 'Q&A must be completed before debriefing' } }, { status: 422 })
  }

  // 2. Resolve most recent ended qa_session
  const { data: qaSession } = await supabase
    .from('qa_sessions')
    .select('id')
    .eq('session_id', session_id)
    .eq('status', 'ended')
    .order('ended_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const qaSessionId = qaSession?.id ?? ''

  // 2b. Concurrent debrief guard — return 409 if a 'generating' row is already active
  const { data: inFlight } = await supabase
    .from('debriefs')
    .select('id')
    .eq('session_id', session_id)
    .eq('status', 'generating')
    .eq('is_active', true)
    .maybeSingle()

  if (inFlight) {
    return Response.json(
      { error: { code: 'CONFLICT', message: 'A debrief is already generating for this session' } },
      { status: 409 },
    )
  }

  // 3. Deactivate any existing active debrief
  await supabase
    .from('debriefs')
    .update({ is_active: false })
    .eq('session_id', session_id)
    .eq('is_active', true)

  // 4. Get attempt number
  const { count } = await supabase
    .from('debriefs')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', session_id)

  const attempt_number = (count ?? 0) + 1

  // 5. Create new debrief row
  const { data: debrief, error: insertError } = await supabase
    .from('debriefs')
    .insert({
      session_id,
      qa_session_id: qaSessionId || null,
      is_active: true,
      attempt_number,
      status: 'generating',
      debrief_progress: {},
    })
    .select('id')
    .single()

  if (insertError || !debrief) {
    return Response.json({ error: { code: 'DB_ERROR', message: insertError?.message } }, { status: 500 })
  }

  const debriefId = debrief.id

  // 6. Stream AG-UI events via SSE
  const encoder = new TextEncoder()
  const runId = crypto.randomUUID()
  const msgId = crypto.randomUUID()

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (data: object) => controller.enqueue(encoder.encode(sseEvent(data)))

      enqueue({ type: 'RUN_STARTED', threadId: session_id, runId })

      try {
        const { runner, sessionService } = createDebriefAgent(session_id, qaSessionId)

        // Create ADK session — positional args: (appName, userId, state?, sessionId?)
        const adkSession = await sessionService.createSession(
          'debrief_demo_room',
          session_id,
        )

        // Accumulate full text response
        let fullText = ''

        enqueue({ type: 'TEXT_MESSAGE_START', messageId: msgId, role: 'assistant' })

        // Run agent and collect streamed content
        const contentChunks: string[] = []
        for await (const event of runner.runAsync({
          userId: session_id,
          sessionId: adkSession.id,
          newMessage: { role: 'user', parts: [{ text: 'Generate the debrief for this session.' }] },
        })) {
          if (event.content?.parts) {
            for (const part of event.content.parts) {
              if (part.text) {
                contentChunks.push(part.text)
                enqueue({ type: 'TEXT_MESSAGE_CONTENT', messageId: msgId, delta: part.text })
              }
            }
          }
        }

        enqueue({ type: 'TEXT_MESSAGE_END', messageId: msgId })

        fullText = contentChunks.join('')

        // Detect API-level error responses before trying to parse as debrief output
        // @iqai/adk surfaces model errors as text: "Error: {\"error\":{\"code\":429,...}}"
        const isApiError = fullText.startsWith('Error:') || fullText.includes('RESOURCE_EXHAUSTED') || fullText.includes('RATE_LIMIT_EXCEEDED')
        if (isApiError) {
          console.error('[debrief] agent returned API error:', fullText.slice(0, 300))
          throw new Error(fullText.slice(0, 200))
        }

        // ── Parse + schema-validation-retry loop ──────────────────────────
        // Pattern: schema-validation-retry-cross-step-learning. If the model
        // returns malformed or schema-invalid JSON, we feed the validation
        // errors back into the same ADK session and ask it to fix — exactly
        // once. Two attempts max (initial + 1 retry) to avoid retry storms.

        function extractJson(text: string): string {
          const fenceOpen = text.indexOf('```')
          const fenceClose = text.lastIndexOf('```')
          if (fenceOpen !== -1 && fenceClose !== -1 && fenceOpen !== fenceClose) {
            const afterOpen = text.indexOf('\n', fenceOpen)
            return afterOpen !== -1 ? text.slice(afterOpen + 1, fenceClose).trim() : text.slice(fenceOpen + 3, fenceClose).trim()
          }
          const start = text.indexOf('{')
          const end = text.lastIndexOf('}')
          return start !== -1 && end !== -1 ? text.slice(start, end + 1) : text.trim()
        }

        function tryParse(text: string): { ok: true; data: DebriefOutput } | { ok: false; reason: string } {
          try {
            const cleaned = extractJson(text)
            const raw = JSON.parse(cleaned)
            const validated = DebriefOutputSchema.safeParse(raw)
            if (validated.success) return { ok: true, data: validated.data as DebriefOutput }
            const issues = validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
            return { ok: false, reason: `schema mismatch — ${issues}` }
          } catch (e) {
            return { ok: false, reason: `JSON parse failed — ${(e as Error).message}` }
          }
        }

        let output: DebriefOutput | null = null
        const firstAttempt = tryParse(fullText)
        if (firstAttempt.ok) {
          output = firstAttempt.data
        } else {
          console.warn('[debrief] first attempt invalid:', firstAttempt.reason.slice(0, 200))
          // Single corrective retry — same ADK session preserves history so the
          // model already has artifacts in context.
          let retryText = ''
          try {
            for await (const event of runner.runAsync({
              userId: session_id,
              sessionId: adkSession.id,
              newMessage: {
                role: 'user',
                parts: [{
                  text: `Your previous output failed validation: ${firstAttempt.reason.slice(0, 500)}. Return ONLY the corrected JSON object with the exact schema specified in your instructions. No prose, no markdown fences.`,
                }],
              },
            })) {
              for (const part of event.content?.parts ?? []) {
                if (part.text) retryText += part.text
              }
            }
            const retryAttempt = tryParse(retryText)
            if (retryAttempt.ok) {
              output = retryAttempt.data
              console.log('[debrief] schema retry succeeded')
            } else {
              console.error('[debrief] schema retry also failed:', retryAttempt.reason.slice(0, 200))
            }
          } catch (e) {
            console.error('[debrief] schema retry threw:', (e as Error).message)
          }
        }

        // ── Output verification loop — ground evidence quotes in source ──
        // Pattern: output-verification-loop. We don't trust the model's
        // "exact quote" claims. Verify each quoted span exists in the
        // pitch transcript or Q&A turns; if not, mark as paraphrased.
        if (output) {
          try {
            const [pitchRes, qaRes] = await Promise.all([
              supabase
                .from('pitch_recordings')
                .select('transcript')
                .eq('session_id', session_id)
                .eq('is_active', true)
                .maybeSingle(),
              qaSessionId
                ? supabase
                    .from('qa_turns')
                    .select('content')
                    .eq('qa_session_id', qaSessionId)
                : Promise.resolve({ data: [] as { content: string }[] }),
            ])
            const transcript = (pitchRes as { data?: { transcript?: string } | null }).data?.transcript ?? ''
            const qaTurns = ((qaRes as { data?: { content: string }[] | null }).data ?? []) as { content: string }[]
            const qaText = qaTurns.map((t) => t.content).join('\n')
            const result = verifyDebriefEvidence(output, { transcript, qaText })
            output = result.output
            console.log(`[debrief] evidence verification: ${result.verifiedCount} verified, ${result.unverifiedCount} paraphrased`)
          } catch (e) {
            console.warn('[debrief] evidence verification failed (non-fatal):', (e as Error).message)
          }
        }

        if (output) {
          const sections: Array<[string, unknown]> = [
            ['verdict', output.verdict],
            ['fracture_map', output.fracture_map],
            ['strengths', output.strengths],
            ['weaknesses', output.weaknesses],
            ['narrative_issues', output.narrative_issues],
            ['delivery_issues', output.delivery_issues],
            ['qa_vulnerabilities', output.qa_vulnerabilities],
            ['next_drill', output.next_drill],
          ]

          for (const [path, value] of sections) {
            enqueue({
              type: 'STATE_DELTA',
              threadId: session_id,
              agentName: 'debrief_agent',
              delta: [{ op: 'add', path: `/${path}`, value }],
            })

            // Fire-and-forget incremental write via jsonb merge RPC
            void supabase.rpc('jsonb_merge_debrief_progress', {
              debrief_id: debriefId,
              patch: { [path]: value },
            })
          }

          // Final write — complete (includes coach_opening_prompts derived from output)
          const coachOpeningPrompts = generateCoachOpeningPrompts(output)
          await supabase
            .from('debriefs')
            .update({ output, status: 'complete', coach_opening_prompts: coachOpeningPrompts })
            .eq('id', debriefId)

          await supabase
            .from('sessions')
            .update({ state: 'debrief_ready' })
            .eq('id', session_id)
        } else {
          await supabase
            .from('debriefs')
            .update({ status: 'failed' })
            .eq('id', debriefId)
        }

        enqueue({ type: 'RUN_FINISHED', threadId: session_id, runId })
      } catch (err) {
        console.error('[debrief] stream error', err)
        enqueue({ type: 'RUN_FINISHED', threadId: session_id, runId })
        await supabase.from('debriefs').update({ status: 'failed' }).eq('id', debriefId)
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Transfer-Encoding': 'chunked',
      Connection: 'keep-alive',
    },
  })
}
