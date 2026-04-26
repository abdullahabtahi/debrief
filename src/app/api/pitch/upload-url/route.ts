import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabase } from '@/lib/supabase'

const BodySchema = z.object({
  session_id:       z.string().uuid(),
  mime_type:        z.string().min(1),
  duration_seconds: z.number().int().positive().nullable().default(null),
})

// POST /api/pitch/upload-url
// Creates a pitch_recordings row (status='pending') and returns a V4 GCS resumable
// signed URL for direct browser-to-GCS upload. Server never handles video bytes.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const parsed = BodySchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'INVALID_INPUT', message: 'Invalid request', details: parsed.error.issues } },
      { status: 400 }
    )
  }

  const { session_id, mime_type, duration_seconds } = parsed.data
  const supabase = getSupabase()

  // Verify session exists
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id')
    .eq('id', session_id)
    .single()

  if (sessionError || !session) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Session not found' } },
      { status: 404 }
    )
  }

  // Create pitch_recordings row (is_active=false until POST /api/pitch/process)
  const { data: recording, error: insertError } = await supabase
    .from('pitch_recordings')
    .insert({
      session_id,
      mime_type,
      duration_seconds,
      status: 'pending',
      is_active: false,
    })
    .select('id')
    .single()

  if (insertError || !recording) {
    console.error('[pitch/upload-url] insert error:', insertError)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Failed to create recording record' } },
      { status: 500 }
    )
  }

  const pitch_recording_id = recording.id
  const bucket = process.env.GCS_BUCKET_NAME

  // Dev mode: no GCS configured — return mock URL
  if (!bucket) {
    const ext = mime_type.startsWith('video/mp4') ? 'mp4'
              : mime_type.startsWith('video/quicktime') ? 'mov'
              : 'webm'
    const gcs_path = `gs://dev-bucket/sessions/${session_id}/pitches/${pitch_recording_id}.${ext}`
    return NextResponse.json({
      upload_url: null,
      gcs_path,
      pitch_recording_id,
      dev_mode: true,
    })
  }

  // Production: V4 GCS resumable signed URL (1-hour TTL)
  const { Storage } = await import('@google-cloud/storage')
  const storage = new Storage()
  const ext = mime_type.startsWith('video/mp4') ? 'mp4'
            : mime_type.startsWith('video/quicktime') ? 'mov'
            : 'webm'
  const gcsKey   = `sessions/${session_id}/pitches/${pitch_recording_id}.${ext}`
  const gcs_path = `gs://${bucket}/${gcsKey}`

  const [upload_url] = await storage
    .bucket(bucket)
    .file(gcsKey)
    .getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
      contentType: mime_type,
    })

  // Store gcs_path on the row now that we have it
  await supabase
    .from('pitch_recordings')
    .update({ video_gcs: gcs_path, status: 'uploading' })
    .eq('id', pitch_recording_id)

  return NextResponse.json({ upload_url, gcs_path, pitch_recording_id, dev_mode: false })
}
