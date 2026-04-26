import { NextResponse } from 'next/server'
import { z } from 'zod'

const BodySchema = z.object({
  session_id: z.string().uuid(),
  file_type: z.enum(['pitch_deck', 'notes', 'hackathon_guidelines']),
  content_type: z.literal('application/pdf'),
})

// POST /api/brief/upload-url
// Returns a V4 GCS signed URL for direct browser-to-GCS upload.
// In dev mode (no GCS configured), returns a mock response.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const parsed = BodySchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'INVALID_INPUT', message: 'Invalid request', details: parsed.error.issues } },
      { status: 400 }
    )
  }

  const { session_id, file_type, content_type } = parsed.data
  const bucket = process.env.GCS_BUCKET_NAME

  // Dev mode fallback — GCS not configured
  if (!bucket) {
    const folder = file_type === 'hackathon_guidelines' ? 'hackathon' : 'briefs'
    const mockPath = `gs://dev-bucket/sessions/${session_id}/${folder}/${file_type}.pdf`
    return NextResponse.json({
      upload_url: null,
      gcs_path: mockPath,
      dev_mode: true,
    })
  }

  // Production: generate V4 signed URL via Google Cloud Storage
  const { Storage } = await import('@google-cloud/storage')
  const storage = new Storage()
  const folder   = file_type === 'hackathon_guidelines' ? 'hackathon' : 'briefs'
  const filename = `${file_type}-${Date.now()}.pdf`
  const gcsPath  = `sessions/${session_id}/${folder}/${filename}`

  const [url] = await storage
    .bucket(bucket)
    .file(gcsPath)
    .getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
      contentType: content_type,
    })

  return NextResponse.json({
    upload_url: url,
    gcs_path: `gs://${bucket}/${gcsPath}`,
    dev_mode: false,
  })
}
