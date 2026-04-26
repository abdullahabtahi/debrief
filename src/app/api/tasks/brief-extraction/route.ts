import { NextResponse } from 'next/server'
import { z } from 'zod'
import { extractBriefInline } from '@/lib/extractBrief'

const BodySchema = z.object({
  session_id:               z.string().uuid(),
  project_brief_id:         z.string().uuid(),
  hackathon_brief_id:       z.string().uuid(),
  project_context:          z.string(),
  hackathon_context:        z.string(),
  hackathon_guidelines_gcs: z.string().nullable().default(null),
})

// POST /api/tasks/brief-extraction
// Internal handler — called by GCP Cloud Tasks only.
// In production, must be OIDC-authenticated via Google Auth Library.
export async function POST(req: Request) {
  // OIDC verification in production
  const isProduction = process.env.NODE_ENV === 'production'
  if (isProduction) {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Missing Authorization header' } },
        { status: 403 }
      )
    }
    const token = authHeader.slice(7)
    const verified = await verifyOidcToken(token)
    if (!verified) {
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

async function verifyOidcToken(token: string): Promise<boolean> {
  try {
    const { OAuth2Client } = await import('google-auth-library')
    const client = new OAuth2Client()
    const ticket = await client.verifyIdToken({ idToken: token })
    const payload = ticket.getPayload()
    // Verify the token was issued for this service's Cloud Run URL
    const audience = process.env.NEXT_PUBLIC_BASE_URL ?? ''
    return !!payload && (!audience || payload.aud === audience)
  } catch {
    return false
  }
}
