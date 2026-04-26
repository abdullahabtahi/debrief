import { NextResponse } from 'next/server'
import { z } from 'zod'
import { transcribeInline } from '@/lib/transcribe'

const BodySchema = z.object({
  session_id:         z.string().uuid(),
  pitch_recording_id: z.string().uuid(),
})

// POST /api/tasks/transcribe
// Internal handler — called by GCP Cloud Tasks only.
// In production, OIDC-verified via Authorization: Bearer <token>.
// In dev, called directly via transcribeInline fire-and-forget.
export async function POST(req: Request) {
  // OIDC verification in production
  if (process.env.NODE_ENV === 'production') {
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

  await transcribeInline(parsed.data)

  return NextResponse.json({ status: 'completed' })
}

async function verifyOidcToken(token: string): Promise<boolean> {
  try {
    const { OAuth2Client } = await import('google-auth-library')
    const audience = process.env.NEXT_PUBLIC_APP_URL ?? ''
    const client   = new OAuth2Client()
    await client.verifyIdToken({ idToken: token, audience })
    return true
  } catch {
    return false
  }
}
