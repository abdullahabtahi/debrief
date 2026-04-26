import { LlmAgent, FunctionTool, InMemorySessionService, Runner } from '@iqai/adk'
import { getSupabase } from '@/lib/supabase'
import type { DebriefOutput } from './debrief'

export type { DebriefOutput }

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CoachTurn {
  role: 'founder' | 'coach'
  content: string
  is_summary: boolean
  sequence_number: number
}

// ── Evidence tools ────────────────────────────────────────────────────────────
// Used for all regular messages. Not used for __init__ (debrief pre-injected).

function makeCoachTools(sessionId: string, qaSessionId: string | null) {
  const supabase = getSupabase()

  const getProjectBrief = new FunctionTool(
    async () => {
      const { data } = await supabase
        .from('project_briefs')
        .select('extracted_summary')
        .eq('session_id', sessionId)
        .eq('is_active', true)
        .maybeSingle()
      return data?.extracted_summary ?? {}
    },
    {
      name: 'get_project_brief',
      description:
        "Returns the project brief summary. Use to recall the founder's problem, solution, differentiator, and tech stack.",
    },
  )

  const getHackathonBrief = new FunctionTool(
    async () => {
      const { data } = await supabase
        .from('hackathon_briefs')
        .select('extracted_summary')
        .eq('session_id', sessionId)
        .eq('is_active', true)
        .maybeSingle()
      return data?.extracted_summary ?? {}
    },
    {
      name: 'get_hackathon_brief',
      description: 'Returns hackathon judging criteria and prizes. Use when coaching on competition fit.',
    },
  )

  const getPitchTranscript = new FunctionTool(
    async () => {
      const { data } = await supabase
        .from('pitch_recordings')
        .select('transcript, transcript_quality, duration_seconds')
        .eq('session_id', sessionId)
        .eq('is_active', true)
        .maybeSingle()
      return {
        transcript: data?.transcript ?? '',
        quality: data?.transcript_quality ?? null, // { word_count, estimated_wpm, filler_word_pct }
        duration_seconds: data?.duration_seconds ?? null,
      }
    },
    {
      name: 'get_pitch_transcript',
      description:
        'Returns the full verbatim pitch transcript plus delivery metrics: quality.estimated_wpm (words per minute), quality.filler_word_pct (0–1 ratio), and duration_seconds. Always cite these exact numbers when coaching on pacing or delivery.',
    },
  )

  const getQaTurns = new FunctionTool(
    async () => {
      if (!qaSessionId) return { turns: [], interruption_count: 0 }

      const [turnsResult, sessionResult] = await Promise.all([
        supabase
          .from('qa_turns')
          .select('speaker, content, sequence_number')
          .eq('qa_session_id', qaSessionId)
          .order('sequence_number', { ascending: true }),
        supabase
          .from('qa_sessions')
          .select('interruption_count')
          .eq('id', qaSessionId)
          .maybeSingle(),
      ])

      return {
        turns: turnsResult.data ?? [],
        interruption_count: sessionResult.data?.interruption_count ?? 0,
      }
    },
    {
      name: 'get_qa_turns',
      description:
        'Returns all Q&A turns verbatim plus interruption_count (how many times judges barged in mid-answer). Cite exact quotes for evidence. If interruption_count > 2, always address it: judges were signalling impatience.',
    },
  )

  return [getProjectBrief, getHackathonBrief, getPitchTranscript, getQaTurns]
}

// ── System Prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(
  debriefOutput: DebriefOutput | null,
  history: CoachTurn[],
  isInit: boolean,
): string {
  const debriefBlock = debriefOutput
    ? `\n\n## DEBRIEF OUTPUT (your primary reference — always available)\n\`\`\`json\n${JSON.stringify(debriefOutput)}\n\`\`\``
    : '\n\n## DEBRIEF: Not available — rely on conversation context.'

  if (isInit) {
    return `You are a post-mortem pitch coach. A founder has just completed their demo day rehearsal — they submitted a brief, recorded a pitch, and survived adversarial Q&A with three judge personas. You have their full debrief.${debriefBlock}

Your task: produce a single, context-aware OPENING MESSAGE that makes the founder immediately feel the session was worth it.

Rules:
- Start with: "I've read your debrief."
- Identify the LOWEST-scoring fracture axis (by score) — name it exactly, state the score out of 10, and quote the top_concern verbatim in double quotes
- Be direct and specific — no flattery, no "great job"
- End with a single open question that invites them to start drilling (e.g. "Where do you want to start?" or "Want to fix this now?")
- Maximum 3–4 sentences total
- Respond with ONLY the opening message text — no labels, no markdown headers, no preamble`
  }

  const historyBlock =
    history.length > 0
      ? `\n\n## CONVERSATION HISTORY (most recent at bottom)\n${history
          .map((m) => {
            if (m.is_summary) return `[EARLIER CONVERSATION SUMMARY]\n${m.content}`
            const label = m.role === 'coach' ? 'Coach' : 'Founder'
            return `${label}: ${m.content}`
          })
          .join('\n\n')}`
      : ''

  return `You are a post-mortem pitch coach. You are direct, evidence-based, and prescriptive. The founder has just completed a full demo day rehearsal — brief, pitch, and adversarial Q&A.${debriefBlock}${historyBlock}

## COACHING RULES
- Reference SPECIFIC moments from the session: "When the VC judge asked about X, you said..." — use get_pitch_transcript and get_qa_turns to pull exact quotes before citing evidence
- Be prescriptive: tell the founder exactly what to change and how to reframe it, not what to "think about"
- Do NOT re-summarize the debrief — the founder has already seen it. Go deeper and drill into specifics
- Do NOT offer generic advice (e.g. "practice more", "be more confident"). Every piece of advice must be anchored to a specific moment from the session evidence
- Do NOT be encouraging for its own sake — honest and direct is more valuable than comfortable
- Keep responses focused: 3–6 sentences or a tight bulleted list. Never pad
- If the founder asks a vague question, anchor the answer to the lowest-scoring fracture axis or the most critical qa_vulnerability
- For delivery coaching: call get_pitch_transcript — it returns quality.estimated_wpm and quality.filler_word_pct. Always cite actual numbers ("you spoke at X WPM, ~160 is optimal") not impressions
- For Q&A coaching: get_qa_turns returns interruption_count. If > 2, flag it explicitly: "judges interrupted you N times — that signals your answers were too long or unfocused"`
}

// ── Agent Factory ─────────────────────────────────────────────────────────────

export interface CreateCoachAgentParams {
  sessionId: string
  qaSessionId: string | null
  debriefOutput: DebriefOutput | null
  history: CoachTurn[]
  isInit: boolean
}

export function createCoachAgent({
  sessionId,
  qaSessionId,
  debriefOutput,
  history,
  isInit,
}: CreateCoachAgentParams) {
  if (!process.env.GOOGLE_CLOUD_PROJECT && !process.env.GOOGLE_API_KEY) {
    throw new Error('Either GOOGLE_CLOUD_PROJECT (Vertex AI) or GOOGLE_API_KEY (AI Studio) must be set')
  }

  const agent = new LlmAgent({
    name: 'coach_agent',
    description: 'Post-mortem pitch coach with full session context and evidence-lookup tools.',
    model: 'gemini-3-flash-preview',
    instruction: buildSystemPrompt(debriefOutput, history, isInit),
    tools: isInit ? [] : makeCoachTools(sessionId, qaSessionId),
  })

  const sessionService = new InMemorySessionService()

  const runner = new Runner({
    agent,
    appName: 'debrief_demo_room',
    sessionService,
  })

  return { runner, sessionService }
}
