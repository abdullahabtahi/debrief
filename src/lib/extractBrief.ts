import { supabase } from './supabase'

interface ExtractionInput {
  session_id: string
  project_brief_id: string
  hackathon_brief_id: string
  project_context: string
  hackathon_context: string
  hackathon_guidelines_gcs: string | null
}

interface ProjectBriefSummary {
  problem: string
  solution: string
  target_user: string
  key_differentiator: string
  tech_stack_hint: string
  team_size_hint: string
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
  const { session_id, project_brief_id, hackathon_brief_id, project_context, hackathon_context, hackathon_guidelines_gcs } = input

  const apiKey = process.env.VERTEX_AI_API_KEY
  const projectId = process.env.GOOGLE_CLOUD_PROJECT
  const location = process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1'

  let projectSummary: ProjectBriefSummary
  let hackathonSummary: HackathonBriefSummary

  if (apiKey || projectId) {
    // Call Gemini Flash via Vertex AI
    const result = await callGeminiFlash({ project_context, hackathon_context, hackathon_guidelines_gcs, apiKey, projectId, location })
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
  hackathon_guidelines_gcs: string | null
  apiKey?: string
  projectId?: string
  location: string
}): Promise<{ project: ProjectBriefSummary; hackathon: HackathonBriefSummary }> {
  const { project_context, hackathon_context, hackathon_guidelines_gcs, apiKey, projectId, location } = opts

  const guidelinesNote = hackathon_guidelines_gcs
    ? `\nHACKATHON GUIDELINES PDF: A PDF document with the full event guidelines has been provided (${hackathon_guidelines_gcs}). Extract judging criteria, constraints, and prizes from it — weight this over the text context if they conflict.`
    : ''

  const prompt = `You are a pitch analyst. Extract structured data from the founder's raw context.

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
    "team_size_hint": "team size if mentioned, else empty string"
  },
  "hackathon": {
    "event_name": "name of the hackathon if mentioned, else empty string",
    "theme": "hackathon theme if mentioned, else empty string",
    "judging_criteria": ["criterion1", "criterion2"],
    "constraints": ["constraint1"],
    "prizes": ["prize1"]
  }
}`

  let responseText: string

  if (apiKey) {
    // Gemini via API key (simpler, works without full GCP setup)
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      }
    )
    const data = await res.json()
    responseText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
  } else {
    // Vertex AI via Application Default Credentials
    const { VertexAI } = await import('@google-cloud/vertexai')
    const vertex = new VertexAI({ project: projectId!, location })
    const model = vertex.getGenerativeModel({ model: 'gemini-2.0-flash' })
    const result = await model.generateContent(prompt)
    responseText = result.response.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
  }

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
