import { NextResponse } from 'next/server'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { extractBriefInline } from '@/lib/extractBrief'

const BodySchema = z.object({
  session_id:               z.string().uuid(),
  project_context:          z.string().min(50, 'Project context must be at least 50 characters'),
  hackathon_context:        z.string().default(''),
  pitch_deck_gcs:           z.string().nullable().default(null),
  notes_gcs:                z.string().nullable().default(null),
  hackathon_guidelines_gcs: z.string().nullable().default(null),
})

// GET /api/brief?session_id=<uuid>
// Returns active project_brief and hackathon_brief for the session.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const session_id = searchParams.get('session_id')

  if (!session_id || !/^[0-9a-f-]{36}$/.test(session_id)) {
    return NextResponse.json(
      { error: { code: 'INVALID_INPUT', message: 'session_id is required' } },
      { status: 400 }
    )
  }

  const [{ data: projectBrief }, { data: hackathonBrief }] = await Promise.all([
    supabase
      .from('project_briefs')
      .select('id, extracted_summary, raw_context, status')
      .eq('session_id', session_id)
      .eq('is_active', true)
      .maybeSingle(),
    supabase
      .from('hackathon_briefs')
      .select('id, extracted_summary, raw_context, status')
      .eq('session_id', session_id)
      .eq('is_active', true)
      .maybeSingle(),
  ])

  return NextResponse.json({ project_brief: projectBrief, hackathon_brief: hackathonBrief })
}

// POST /api/brief
// Saves brief records and enqueues extraction.
// In dev mode, runs extraction inline and waits for the result.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const parsed = BodySchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'INVALID_INPUT', message: parsed.error.issues[0].message, details: parsed.error.issues } },
      { status: 400 }
    )
  }

  const { session_id, project_context, hackathon_context, pitch_deck_gcs, notes_gcs, hackathon_guidelines_gcs } = parsed.data

  // Verify session exists
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, state')
    .eq('id', session_id)
    .single()

  if (sessionError || !session) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Session not found' } },
      { status: 404 }
    )
  }

  // Mark any existing active briefs as superseded
  await supabase
    .from('project_briefs')
    .update({ is_active: false, status: 'superseded' })
    .eq('session_id', session_id)
    .eq('is_active', true)

  await supabase
    .from('hackathon_briefs')
    .update({ is_active: false, status: 'superseded' })
    .eq('session_id', session_id)
    .eq('is_active', true)

  // Insert new brief records (is_active = false until extraction succeeds)
  const { data: projectBrief, error: pbError } = await supabase
    .from('project_briefs')
    .insert({
      session_id,
      raw_context: project_context,
      pitch_deck_gcs,
      notes_gcs,
      status: 'extracting',
      is_active: false,
    })
    .select('id')
    .single()

  if (pbError || !projectBrief) {
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Failed to save project brief' } },
      { status: 500 }
    )
  }

  const { data: hackathonBrief, error: hbError } = await supabase
    .from('hackathon_briefs')
    .insert({
      session_id,
      raw_context: hackathon_context,
      guidelines_gcs: hackathon_guidelines_gcs,
      status: 'extracting',
      is_active: false,
    })
    .select('id')
    .single()

  if (hbError || !hackathonBrief) {
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Failed to save hackathon brief' } },
      { status: 500 }
    )
  }

  const devMode = process.env.BRIEF_EXTRACTION_DEV_MODE === 'true'
  const cloudTasksQueue = process.env.CLOUD_TASKS_QUEUE_NAME

  if (devMode || !cloudTasksQueue) {
    // Dev mode: run extraction inline (no Cloud Tasks)
    // Fire-and-forget — client polls for session state
    extractBriefInline({
      session_id,
      project_brief_id: projectBrief.id,
      hackathon_brief_id: hackathonBrief.id,
      project_context,
      hackathon_context,
      hackathon_guidelines_gcs,
    }).catch((err) => {
      console.error('[brief-extraction] inline extraction failed:', err)
    })
  } else {
    // Production: enqueue Cloud Tasks
    const { CloudTasksClient } = await import('@google-cloud/tasks')
    const client = new CloudTasksClient()
    const project  = process.env.GOOGLE_CLOUD_PROJECT!
    const location = process.env.CLOUD_TASKS_LOCATION!
    const queue    = process.env.CLOUD_TASKS_QUEUE_NAME!
    const parent   = client.queuePath(project, location, queue)
    const baseUrl  = process.env.NEXT_PUBLIC_BASE_URL ?? `https://${req.headers.get('host')}`

    await client.createTask({
      parent,
      task: {
        httpRequest: {
          httpMethod: 'POST' as const,
          url: `${baseUrl}/api/tasks/brief-extraction`,
          headers: { 'Content-Type': 'application/json' },
          body: Buffer.from(
            JSON.stringify({
              session_id,
              project_brief_id: projectBrief.id,
              hackathon_brief_id: hackathonBrief.id,
              project_context,
              hackathon_context,
              hackathon_guidelines_gcs,
            })
          ).toString('base64'),
          oidcToken: {
            serviceAccountEmail: `${project}@appspot.gserviceaccount.com`,
          },
        },
      },
    })
  }

  return NextResponse.json({ status: 'extracting', project_brief_id: projectBrief.id })
}
