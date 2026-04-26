import { NextResponse } from 'next/server'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'

const BodySchema = z.object({
  session_id: z.string().uuid(),
  qa_session_id: z.string().uuid(),
})

// POST /api/qa/heartbeat
// Updates last_heartbeat_at. Called every 30s to signal an active session.
// Server-side Cloud Scheduler marks sessions with stale heartbeat as abandoned.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const parsed = BodySchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'INVALID_INPUT', message: parsed.error.issues[0].message } },
      { status: 400 },
    )
  }

  const { session_id, qa_session_id } = parsed.data

  const { error } = await supabase
    .from('qa_sessions')
    .update({ last_heartbeat_at: new Date().toISOString() })
    .eq('id', qa_session_id)
    .eq('session_id', session_id)
    .eq('status', 'active')

  if (error) {
    console.error('[qa/heartbeat] Update error:', error)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Heartbeat failed' } },
      { status: 500 },
    )
  }

  return NextResponse.json({ status: 'ok' })
}
