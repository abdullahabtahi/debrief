import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabase } from '@/lib/supabase'

const PostBodySchema = z.object({
  session_id:          z.string().uuid(),
  pitch_recording_id:  z.string().uuid(),
})

// POST /api/pitch/process
// Archives previous active pitch_recording, activates the new one, and enqueues
// the Cloud Tasks STT job. In dev mode, runs transcription inline (fire-and-forget).
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const parsed = PostBodySchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'INVALID_INPUT', message: 'Invalid request', details: parsed.error.issues } },
      { status: 400 }
    )
  }

  const { session_id, pitch_recording_id } = parsed.data
  const supabase = getSupabase()

  // Verify the recording belongs to the session
  const { data: recording, error: recError } = await supabase
    .from('pitch_recordings')
    .select('id, mime_type, video_gcs, duration_seconds')
    .eq('id', pitch_recording_id)
    .eq('session_id', session_id)
    .single()

  if (recError || !recording) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Recording not found' } },
      { status: 404 }
    )
  }

  // Archive previous active recording (if any)
  await supabase
    .from('pitch_recordings')
    .update({ is_active: false })
    .eq('session_id', session_id)
    .eq('is_active', true)
    .neq('id', pitch_recording_id)

  // Activate the new recording and set status to processing
  await supabase
    .from('pitch_recordings')
    .update({ is_active: true, status: 'processing' })
    .eq('id', pitch_recording_id)

  const taskPayload = { session_id, pitch_recording_id }

  const queueName    = process.env.CLOUD_TASKS_TRANSCRIBE_QUEUE ?? process.env.CLOUD_TASKS_QUEUE_NAME
  const taskLocation = process.env.CLOUD_TASKS_LOCATION
  const gcpProject   = process.env.GOOGLE_CLOUD_PROJECT
  const appUrl       = process.env.TASK_AUDIENCE ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  if (queueName && taskLocation && gcpProject) {
    // Production: enqueue via Cloud Tasks
    const { CloudTasksClient } = await import('@google-cloud/tasks')
    const tasksClient = new CloudTasksClient()
    const parent = tasksClient.queuePath(gcpProject, taskLocation, queueName)
    const taskSa = process.env.CLOUD_TASKS_SERVICE_ACCOUNT ?? `debrief-demo-room-live@${gcpProject}.iam.gserviceaccount.com`

    await tasksClient.createTask({
      parent,
      task: {
        httpRequest: {
          httpMethod: 'POST' as const,
          url: `${appUrl}/api/tasks/transcribe`,
          headers: { 'Content-Type': 'application/json' },
          body: Buffer.from(JSON.stringify(taskPayload)).toString('base64'),
          oidcToken: {
            serviceAccountEmail: taskSa,
            audience: appUrl,
          },
        },
      },
    })
  } else {
    // Dev mode: fire-and-forget inline
    const { transcribeInline } = await import('@/lib/transcribe')
    transcribeInline(taskPayload).catch((err: unknown) =>
      console.error('[pitch/process] inline transcription error:', err)
    )
  }

  return NextResponse.json({ status: 'queued' })
}
