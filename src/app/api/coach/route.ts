import { z } from 'zod'
import { GoogleGenAI } from '@google/genai'
import { getSupabase } from '@/lib/supabase'
import { createCoachAgent } from '@/agents/coach'
import type { DebriefOutput, CoachTurn } from '@/agents/coach'
import { rateLimit, getClientIp, tooManyRequests } from '@/lib/rateLimit'

// ── Schemas ───────────────────────────────────────────────────────────────────

const PostBodySchema = z.object({
  session_id: z.string().uuid('session_id must be a valid UUID'),
  debrief_id: z.string().uuid('debrief_id must be a valid UUID'),
  message: z.string().min(1, 'Message cannot be empty').max(2000, 'Message exceeds 2000 characters'),
})

// ── SSE helper ────────────────────────────────────────────────────────────────

function sseEvent(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

// ── Compaction: summarize oldest turns via Gemini Flash Lite ─────────────────

async function summarizeTurns(turns: CoachTurn[]): Promise<string> {
  const historyText = turns
    .map((t) => {
      if (t.is_summary) return `[EARLIER SUMMARY]\n${t.content}`
      const label = t.role === 'coach' ? 'Coach' : 'Founder'
      return `${label}: ${t.content}`
    })
    .join('\n\n')

  // Compaction runs on Vertex AI (GCP billing), same as the coach agent.
  // GOOGLE_GENAI_USE_VERTEXAI is set globally but @google/genai constructor
  // does not auto-read it — pass vertexai explicitly here.
  const ai = new GoogleGenAI({
    vertexai: true,
    project: process.env.GOOGLE_CLOUD_PROJECT!,
    location: process.env.GOOGLE_CLOUD_LOCATION ?? 'global',
  })
  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash-lite',
    contents: `Summarize the following pitch coaching conversation in 150 words. Preserve: the specific weaknesses identified, the exact prescriptive advice given, and any commitments or decisions made by the founder.\n\n${historyText}`,
  })
  return result.text ?? '[Conversation summary unavailable]'
}

// ── POST /api/coach ───────────────────────────────────────────────────────────
// Body: { session_id, debrief_id, message }
// Streams an SSE response. Special message '__init__' triggers the coach opener.

export async function POST(req: Request) {
  const ip = getClientIp(req)
  const rl = rateLimit(`coach:${ip}`, 30, 60) // 30 messages / min / IP
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec)

  const body = await req.json().catch(() => null)
  const parsed = PostBodySchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: { code: 'INVALID_INPUT', message: parsed.error.issues[0].message } },
      { status: 400 },
    )
  }

  const { session_id, debrief_id, message } = parsed.data
  const supabase = getSupabase()

  // Verify debrief is active + complete for this session
  const { data: debrief } = await supabase
    .from('debriefs')
    .select('id, output, status, qa_session_id')
    .eq('id', debrief_id)
    .eq('session_id', session_id)
    .eq('is_active', true)
    .maybeSingle()

  if (!debrief || debrief.status !== 'complete') {
    return Response.json(
      { error: { code: 'INVALID_STATE', message: 'Active complete debrief not found for this session' } },
      { status: 422 },
    )
  }

  const debriefRow = debrief as { id: string; output: unknown; status: string; qa_session_id: string | null }
  const debriefOutput = debriefRow.output as DebriefOutput | null
  const qaSessionId = debriefRow.qa_session_id

  // ── Handle __init__ sentinel ───────────────────────────────────────────────
  if (message === '__init__') {
    const { count } = await supabase
      .from('coach_messages')
      .select('id', { count: 'exact', head: true })
      .eq('debrief_id', debrief_id)

    if ((count ?? 0) > 0) {
      return Response.json(
        { error: { code: 'INVALID_STATE', message: 'Coach opening already exists for this debrief' } },
        { status: 422 },
      )
    }

    return streamCoachResponse({
      sessionId: session_id,
      debriefId: debrief_id,
      qaSessionId: null,
      debriefOutput,
      history: [],
      isInit: true,
      userMessage: 'Produce the opening message now.',
      isFirstFounderMessage: false,
    })
  }

  // ── Regular message ────────────────────────────────────────────────────────

  // Fetch current conversation (excluding the message we're about to write)
  const { data: allMsgs } = await supabase
    .from('coach_messages')
    .select('id, role, content, sequence_number, is_summary, created_at')
    .eq('debrief_id', debrief_id)
    .order('sequence_number', { ascending: true })

  const existingMessages = allMsgs ?? []

  // Detect first founder message — triggers state transition to 'completed'
  const isFirstFounderMessage = !existingMessages.some((m) => m.role === 'founder')

  // Compute next sequence number and write founder message to DB
  const maxSeq = existingMessages.length > 0
    ? Math.max(...existingMessages.map((m) => m.sequence_number))
    : 0
  const founderSeq = maxSeq + 1

  await supabase
    .from('coach_messages')
    .insert({
      session_id,
      debrief_id,
      role: 'founder',
      content: message,
      sequence_number: founderSeq,
      is_summary: false,
    })

  // ── Compaction: compact oldest 20 non-summary rows if > 40 exist ──────────
  const nonSummaryMsgs = existingMessages.filter((m) => !m.is_summary)
  let contextMessages: CoachTurn[] = existingMessages.map((m) => ({
    role: m.role as 'founder' | 'coach',
    content: m.content ?? '',
    is_summary: m.is_summary,
    sequence_number: m.sequence_number,
  }))

  if (nonSummaryMsgs.length > 40) {
    const toCompact = nonSummaryMsgs.slice(0, 20)
    const compactMinSeq = toCompact[0].sequence_number

    const summaryText = await summarizeTurns(
      toCompact.map((m) => ({
        role: m.role as 'founder' | 'coach',
        content: m.content ?? '',
        is_summary: m.is_summary,
        sequence_number: m.sequence_number,
      })),
    )

    // Delete compacted rows and replace with a single summary row
    await supabase
      .from('coach_messages')
      .delete()
      .in('id', toCompact.map((m) => m.id))

    await supabase.from('coach_messages').insert({
      session_id,
      debrief_id,
      role: 'coach',
      content: summaryText,
      sequence_number: compactMinSeq,
      is_summary: true,
    })

    // Rebuild context for the agent with compacted history
    const retained = existingMessages.filter((m) => !toCompact.some((tc) => tc.id === m.id))
    const summaryEntry: CoachTurn = {
      role: 'coach',
      content: summaryText,
      is_summary: true,
      sequence_number: compactMinSeq,
    }
    contextMessages = [
      summaryEntry,
      ...retained.map((m) => ({
        role: m.role as 'founder' | 'coach',
        content: m.content ?? '',
        is_summary: m.is_summary,
        sequence_number: m.sequence_number,
      })),
    ].sort((a, b) => a.sequence_number - b.sequence_number)
  }

  return streamCoachResponse({
    sessionId: session_id,
    debriefId: debrief_id,
    qaSessionId,
    debriefOutput,
    history: contextMessages,
    isInit: false,
    userMessage: message,
    isFirstFounderMessage,
  })
}

// ── Core streaming function ───────────────────────────────────────────────────

interface StreamParams {
  sessionId: string
  debriefId: string
  qaSessionId: string | null
  debriefOutput: DebriefOutput | null
  history: CoachTurn[]
  isInit: boolean
  userMessage: string
  isFirstFounderMessage: boolean
}

function streamCoachResponse(params: StreamParams): Response {
  const { sessionId, debriefId, qaSessionId, debriefOutput, history, isInit, userMessage, isFirstFounderMessage } =
    params
  const supabase = getSupabase()

  const encoder = new TextEncoder()
  const runId = crypto.randomUUID()
  const msgId = crypto.randomUUID()

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (data: object) =>
        controller.enqueue(encoder.encode(sseEvent(data)))

      enqueue({ type: 'RUN_STARTED', threadId: sessionId, runId })

      try {
        const { runner, sessionService } = createCoachAgent({
          sessionId,
          qaSessionId: isInit ? null : qaSessionId,
          debriefOutput,
          history: isInit ? [] : history,
          isInit,
        })

        const adkSession = await sessionService.createSession('debrief_demo_room', sessionId)

        enqueue({ type: 'TEXT_MESSAGE_START', messageId: msgId, role: 'assistant' })

        let fullText = ''

        for await (const event of runner.runAsync({
          userId: sessionId,
          sessionId: adkSession.id,
          newMessage: { role: 'user', parts: [{ text: userMessage }] },
        })) {
          if (event.content?.parts) {
            for (const part of event.content.parts) {
              // Tool call start — notify frontend
              if (part.functionCall) {
                enqueue({
                  type: 'TOOL_CALL_START',
                  toolCallId: part.functionCall.id ?? crypto.randomUUID(),
                  toolName: part.functionCall.name,
                })
              }
              // Tool result — notify frontend
              if (part.functionResponse) {
                enqueue({
                  type: 'TOOL_CALL_END',
                  toolCallId: part.functionResponse.id ?? crypto.randomUUID(),
                  toolName: part.functionResponse.name,
                })
              }
              if (part.text) {
                fullText += part.text
                enqueue({ type: 'TEXT_MESSAGE_CONTENT', messageId: msgId, delta: part.text })
              }
            }
          }
        }

        enqueue({ type: 'TEXT_MESSAGE_END', messageId: msgId })

        // Persist coach response — compute next sequence number from DB
        const { data: latestSeqRow } = await supabase
          .from('coach_messages')
          .select('sequence_number')
          .eq('debrief_id', debriefId)
          .order('sequence_number', { ascending: false })
          .limit(1)
          .maybeSingle()

        const coachSeq = isInit ? 0 : ((latestSeqRow?.sequence_number ?? 0) + 1)

        await supabase.from('coach_messages').insert({
          session_id: sessionId,
          debrief_id: debriefId,
          role: 'coach',
          content: fullText,
          sequence_number: coachSeq,
          is_summary: false,
        })

        // Transition session to 'completed' on first real founder interaction
        if (isFirstFounderMessage && !isInit) {
          await supabase
            .from('sessions')
            .update({ state: 'completed' })
            .eq('id', sessionId)

          enqueue({ type: 'STATE_UPDATE', state: 'completed' })
        }

        enqueue({ type: 'RUN_FINISHED', threadId: sessionId, runId })
      } catch (err) {
        console.error('[coach] stream error', err)
        enqueue({
          type: 'TEXT_MESSAGE_CONTENT',
          messageId: msgId,
          delta: "I'm having trouble connecting right now. Please try again.",
        })
        enqueue({ type: 'TEXT_MESSAGE_END', messageId: msgId })
        enqueue({ type: 'RUN_FINISHED', threadId: sessionId, runId })
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
