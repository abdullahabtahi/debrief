import { supabase } from './supabase'

interface ExtractionInput {
  session_id: string
  project_brief_id: string
  hackathon_brief_id: string
  project_context: string
  hackathon_context: string
  hackathon_guidelines_url: string | null
}

interface ProjectBriefSummary {
  problem: string
  solution: string
  target_user: string
  key_differentiator: string
  tech_stack_hint: string
  team_size_hint: string
  data_strategy: string
  competitive_moat: string
  market_validation: string
  failure_modes: string
}

interface HackathonBriefSummary {
  event_name: string
  theme: string
  judging_criteria: string[]
  constraints: string[]
  prizes: string[]
}

// extractBriefInline — called in dev mode or when Cloud Tasks not configured.
// Calls Gemini Flash directly and writes results to Supabase.
export async function extractBriefInline(input: ExtractionInput): Promise<void> {
  const { session_id, project_brief_id, hackathon_brief_id, project_context, hackathon_context, hackathon_guidelines_url } = input

  const projectId = process.env.GOOGLE_CLOUD_PROJECT
  const location = process.env.GOOGLE_CLOUD_LOCATION ?? 'global'

  let projectSummary: ProjectBriefSummary
  let hackathonSummary: HackathonBriefSummary

  if (projectId) {
    // Call Gemini 3 Flash via Vertex AI
    const result = await callGeminiFlash({ project_context, hackathon_context, hackathon_guidelines_url, projectId, location })
    projectSummary = result.project
    hackathonSummary = result.hackathon
  } else {
    // No GCP credentials — use stub extraction for dev/demo
    projectSummary = stubExtractProject(project_context)
    hackathonSummary = stubExtractHackathon(hackathon_context)
  }

  // Derive session title from problem field (used only if user has not set one)
  const extractedTitle = projectSummary.problem.slice(0, 60)

  // Fetch current session to check if user has already set a title
  const { data: currentSession } = await supabase
    .from('sessions')
    .select('title')
    .eq('id', session_id)
    .single()

  const titleUpdate = currentSession?.title ? {} : { title: extractedTitle }

  // Write extraction results
  await Promise.all([
    supabase
      .from('project_briefs')
      .update({ extracted_summary: projectSummary, status: 'ready', is_active: true })
      .eq('id', project_brief_id),

    supabase
      .from('hackathon_briefs')
      .update({ extracted_summary: hackathonSummary, status: 'ready', is_active: true })
      .eq('id', hackathon_brief_id),

    supabase
      .from('sessions')
      .update({ state: 'brief_ready', ...titleUpdate })
      .eq('id', session_id),
  ])
}

// ── Gemini Flash call ──────────────────────────────────────────────────────

async function callGeminiFlash(opts: {
  project_context: string
  hackathon_context: string
  hackathon_guidelines_url: string | null
  projectId: string
  location: string
}): Promise<{ project: ProjectBriefSummary; hackathon: HackathonBriefSummary }> {
  const { project_context, hackathon_context, hackathon_guidelines_url, projectId, location } = opts

  const guidelinesNote = hackathon_guidelines_url
    ? `\nHACKATHON GUIDELINES URL: The official hackathon page/rubric is available at ${hackathon_guidelines_url}. Extract judging criteria, constraints, and prizes from it — weight this over the text context if they conflict.`
    : ''

  const prompt = `You are a strict, adversarial VC judge analyst preparing a briefing document for a panel of judges.

Your goal is to synthesize the founder's raw context into a sharp, judge-facing summary. DO NOT just extract what they said—synthesize what a sharp judge needs to know to probe effectively (including spotting glaring omissions).

PROJECT CONTEXT:
${project_context}

HACKATHON CONTEXT:
${hackathon_context || '(not provided)'}${guidelinesNote}

Respond with ONLY valid JSON in this exact shape:
{
  "project": {
    "problem": "1-2 sentence description of the problem being solved",
    "solution": "1-2 sentence description of the solution",
    "target_user": "who benefits from this",
    "key_differentiator": "what makes this unique",
    "tech_stack_hint": "tech stack if mentioned, else empty string",
    "team_size_hint": "team size if mentioned, else empty string",
    "data_strategy": "Where does the data come from? What's the feedback loop? If missing entirely, state 'MISSING - Critical vulnerability line of questioning'",
    "competitive_moat": "What stops incumbents from copying this? If not obvious, state 'VULNERABLE - No obvious moat'",
    "market_validation": "Is there any evidence this is wanted (traction/users/interviews)? If none, state 'UNVALIDATED - Pure hypothesis'",
    "failure_modes": "What happens when the model/system is wrong? Failure mitigation? If missing, state 'UNADDRESSED - Probe on error handling/trust'"
  },
  "hackathon": {
    "event_name": "name of the hackathon if mentioned, else empty string",
    "theme": "hackathon theme if mentioned, else empty string",
    "judging_criteria": ["criterion1", "criterion2"],
    "constraints": ["constraint1"],
    "prizes": ["prize1"]
  }
}`

  // Vertex AI via Application Default Credentials
  const { GoogleGenAI } = await import('@google/genai')
  const ai = new GoogleGenAI({ vertexai: true, project: projectId, location })
  const result = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: { responseMimeType: 'application/json' },
  })
  
  const responseText = result.text ?? '{}'

  // Strip markdown fences if present
  const cleaned = responseText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()
  const parsed = JSON.parse(cleaned)
  return { project: parsed.project, hackathon: parsed.hackathon }
}

// ── Stub extraction (no GCP credentials) ──────────────────────────────────

function stubExtractProject(context: string): ProjectBriefSummary {
  const words = context.split(/\s+/).slice(0, 20).join(' ')
  return {
    problem:            `${words}...`,
    solution:           'Solution extracted from brief context.',
    target_user:        'Founders and early-stage teams.',
    key_differentiator: 'AI-powered, adversarial rehearsal environment.',
    tech_stack_hint:    '',
    team_size_hint:     '',
    data_strategy:      'Synthetic data generated by AI.',
    competitive_moat:   'First mover in adversarial pitch practice.',
    market_validation:  'Waitlist of 500 founders.',
    failure_modes:      'AI hallucinations causing bad advice.',
  }
}

function stubExtractHackathon(context: string): HackathonBriefSummary {
  return {
    event_name:        context ? 'Hackathon Event' : '',
    theme:             context ? 'AI Innovation' : '',
    judging_criteria:  context ? ['Innovation', 'Technical Execution', 'Impact'] : [],
    constraints:       [],
    prizes:            [],
  }
}
