import { LlmAgent, FunctionTool, InMemorySessionService, Runner } from '@iqai/adk'
import { getSupabase } from '@/lib/supabase'

// ── Types ────────────────────────────────────────────────────────────────────

export interface FractureScore {
  score: number
  top_concern: string
}

export interface Finding {
  title: string
  explanation: string
}

export interface Issue {
  title: string
  evidence: string
  recommendation: string
  persona?: 'vc' | 'domain_expert' | 'user_advocate' | null
}

export interface DebriefOutput {
  verdict: string
  fracture_map: {
    vc: FractureScore
    domain_expert: FractureScore
    user_advocate: FractureScore
    overall_score: number
  }
  strengths: Finding[]
  weaknesses: Finding[]
  narrative_issues: Issue[]
  delivery_issues: Issue[]
  qa_vulnerabilities: Issue[]
  next_drill: string
}

// ── Tools (direct Supabase — no MCP Toolbox sidecar needed) ──────────────────
//
// PERFORMANCE: We expose ONE combined tool that fetches all session artifacts
// in parallel via Promise.all. Previously this was 4 separate tools, which
// forced the LLM into 4 sequential round-trips before it could write the
// debrief — adding ~12-24s of pure handshake latency on Gemini 3 Flash. With
// one tool, the agent does a single round-trip, then drafts the JSON.
//
// We keep the individual fetchers as fallbacks in case the model wants to
// refresh one source mid-stream (cheap; same Supabase client).

function makeTools(sessionId: string, qaSessionId: string) {
  const supabase = getSupabase()

  async function fetchProjectBrief() {
    const { data } = await supabase
      .from('project_briefs')
      .select('extracted_summary')
      .eq('session_id', sessionId)
      .eq('is_active', true)
      .maybeSingle()
    return data?.extracted_summary ?? {}
  }

  async function fetchHackathonBrief() {
    const { data } = await supabase
      .from('hackathon_briefs')
      .select('extracted_summary')
      .eq('session_id', sessionId)
      .eq('is_active', true)
      .maybeSingle()
    return data?.extracted_summary ?? {}
  }

  async function fetchPitchTranscript() {
    const { data } = await supabase
      .from('pitch_recordings')
      .select('transcript, transcript_quality, duration_seconds')
      .eq('session_id', sessionId)
      .eq('is_active', true)
      .maybeSingle()
    return {
      transcript: data?.transcript ?? '',
      quality: data?.transcript_quality ?? null,
      duration_seconds: data?.duration_seconds ?? null,
    }
  }

  async function fetchQaTurns() {
    const [turnsRes, sessionRes] = await Promise.all([
      supabase
        .from('qa_turns')
        .select('speaker, content, sequence_number, timestamp_offset')
        .eq('qa_session_id', qaSessionId)
        .order('sequence_number', { ascending: true }),
      supabase
        .from('qa_sessions')
        .select('interruption_count')
        .eq('id', qaSessionId)
        .maybeSingle(),
    ])
    return {
      turns: turnsRes.data ?? [],
      interruption_count: sessionRes.data?.interruption_count ?? 0,
    }
  }

  // Combined tool — single round-trip fetch of every artifact in parallel.
  const getSessionArtifacts = new FunctionTool(
    async () => {
      const [projectBrief, hackathonBrief, pitch, qa] = await Promise.all([
        fetchProjectBrief(),
        fetchHackathonBrief(),
        fetchPitchTranscript(),
        fetchQaTurns(),
      ])
      return {
        project_brief: projectBrief,
        hackathon_brief: hackathonBrief,
        pitch_transcript: pitch.transcript,
        delivery_metrics: {
          word_count: pitch.quality?.word_count ?? null,
          estimated_wpm: pitch.quality?.estimated_wpm ?? null,
          filler_word_pct: pitch.quality?.filler_word_pct ?? null,
          duration_seconds: pitch.duration_seconds,
        },
        qa_turns: qa.turns,
        interruption_count: qa.interruption_count,
      }
    },
    {
      name: 'get_session_artifacts',
      description:
        'Returns ALL session artifacts in one call: project_brief, hackathon_brief, pitch_transcript, delivery_metrics (wpm, filler_word_pct, duration), qa_turns, interruption_count. Call this ONCE at the start — do not call individual tools.',
    },
  )

  return [getSessionArtifacts]
}

// ── System Prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior pitch coach and former VC partner. You have just watched a founder's pitch and sat through the Q&A. Your job is to produce a structured debrief.

MANDATORY: Call get_session_artifacts EXACTLY ONCE first to load all session data, then write the analysis. Do not call it more than once.

Your output MUST be valid JSON matching this exact structure (no extra keys, no markdown):
{
  "verdict": "<2-3 sentence overall assessment>",
  "fracture_map": {
    "vc": { "score": <0-10>, "top_concern": "<1 sentence>" },
    "domain_expert": { "score": <0-10>, "top_concern": "<1 sentence>" },
    "user_advocate": { "score": <0-10>, "top_concern": "<1 sentence>" },
    "overall_score": <0-10>
  },
  "strengths": [{ "title": "...", "explanation": "..." }],
  "weaknesses": [{ "title": "...", "explanation": "..." }],
  "narrative_issues": [{ "title": "...", "evidence": "<exact quote>", "recommendation": "...", "persona": "vc|domain_expert|user_advocate|null" }],
  "delivery_issues": [{ "title": "...", "evidence": "<exact quote>", "recommendation": "...", "persona": null }],
  "qa_vulnerabilities": [{ "title": "...", "evidence": "<exact quote>", "recommendation": "...", "persona": "vc|domain_expert|user_advocate" }],
  "next_drill": "<single most important action>"
}

Rules:
- strengths and weaknesses: max 5 each
- qa_vulnerabilities: populate "persona" for ≥80% of items (which judge persona raised it)
- delivery_issues: cite exact wpm/filler numbers from delivery_metrics when relevant
- Do NOT include a "label" field anywhere — labels are derived on the frontend
- Output ONLY the JSON object, nothing else`

// ── Agent factory ─────────────────────────────────────────────────────────────

export function createDebriefAgent(sessionId: string, qaSessionId: string) {
  if (!process.env.GOOGLE_CLOUD_PROJECT && !process.env.GOOGLE_API_KEY) {
    throw new Error('Either GOOGLE_CLOUD_PROJECT (Vertex AI) or GOOGLE_API_KEY (AI Studio) must be set')
  }

  const agent = new LlmAgent({
    name: 'debrief_agent',
    description: 'Produces a structured debrief from pitch + Q&A session artifacts.',
    model: 'gemini-3-flash-preview',
    instruction: SYSTEM_PROMPT,
    tools: makeTools(sessionId, qaSessionId),
  })

  const sessionService = new InMemorySessionService()

  const runner = new Runner({
    agent,
    appName: 'debrief_demo_room',
    sessionService,
  })

  return { agent, runner, sessionService }
}
