import { NextResponse } from 'next/server'
import { z } from 'zod'
import { transcribeInline } from '@/lib/transcribe'
import { verifyCloudTasksOidc } from '@/lib/verifyOidc'

const BodySchema = z.object({
  session_id:         z.string().uuid(),
  pitch_recording_id: z.string().uuid(),
})

// POST /api/tasks/transcribe
// Internal handler — called by GCP Cloud Tasks only.
// In production, OIDC-verified via Authorization: Bearer <token>.
// In dev, called directly via transcribeInline fire-and-forget.
export async function POST(req: Request) {
  // OIDC verification in production — fail-closed
  if (process.env.NODE_ENV === 'production') {
    const result = await verifyCloudTasksOidc(req.headers.get('Authorization'))
    if (!result.ok) {
      console.warn('[tasks/transcribe] OIDC reject:', result.reason)
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


