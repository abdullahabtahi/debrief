import { NextResponse } from 'next/server'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'

const BodySchema = z.object({
  qa_session_id: z.string().uuid(),
  session_id: z.string().uuid(),
})

// PATCH /api/qa/session
// Sets started_at on the qa_sessions record when the WebSocket opens.
// Called from the browser's WebSocket onopen callback.
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null)
  const parsed = BodySchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'INVALID_INPUT', message: parsed.error.issues[0].message } },
      { status: 400 },
    )
  }

  const { qa_session_id, session_id } = parsed.data

  const { error } = await supabase
    .from('qa_sessions')
    .update({ started_at: new Date().toISOString() })
    .eq('id', qa_session_id)
    .eq('session_id', session_id)
    .is('started_at', null) // Only set once (idempotency)

  if (error) {
    console.error('[qa/session PATCH] Error:', error)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Failed to set started_at' } },
      { status: 500 },
    )
  }

  return NextResponse.json({ status: 'ok' })
}
