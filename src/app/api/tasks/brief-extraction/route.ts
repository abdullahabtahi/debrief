import { NextResponse } from 'next/server'
import { z } from 'zod'
import { extractBriefInline } from '@/lib/extractBrief'
import { verifyCloudTasksOidc } from '@/lib/verifyOidc'

const BodySchema = z.object({
  session_id:               z.string().uuid(),
  project_brief_id:         z.string().uuid(),
  hackathon_brief_id:       z.string().uuid(),
  project_context:          z.string(),
  hackathon_context:        z.string(),
  hackathon_guidelines_url: z.string().nullable().default(null),
})

// POST /api/tasks/brief-extraction
// Internal handler — called by GCP Cloud Tasks only.
// In production, must be OIDC-authenticated via Google Auth Library.
export async function POST(req: Request) {
  // OIDC verification in production — fail-closed
  if (process.env.NODE_ENV === 'production') {
    const result = await verifyCloudTasksOidc(req.headers.get('Authorization'))
    if (!result.ok) {
      console.warn('[tasks/brief-extraction] OIDC reject:', result.reason)
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Invalid OIDC token' } },
        { status: 403 }
      )
    }
  }

  const body = await req.json().catch(() => null)
  const parsed = BodySchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'INVALID_INPUT', message: 'Invalid payload', details: parsed.error.issues } },
      { status: 400 }
    )
  }

  await extractBriefInline(parsed.data)

  return NextResponse.json({ status: 'ok' })
}


