import { NextResponse } from 'next/server'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'

const BodySchema = z.object({
  session_id: z.string().uuid(),
  qa_session_id: z.string().uuid(),
  interruption_count: z.number().int().min(0).default(0),
})

// POST /api/qa/end
// Finalizes the qa_session record and transitions session state to qa_completed.
// Idempotent: if already ended, returns success with no side effects.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const parsed = BodySchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'INVALID_INPUT', message: parsed.error.issues[0].message } },
      { status: 400 },
    )
  }

  const { session_id, qa_session_id, interruption_count } = parsed.data

  // Fetch the qa_session to compute duration
  const { data: qaSession, error: fetchError } = await supabase
    .from('qa_sessions')
    .select('id, status, started_at')
    .eq('id', qa_session_id)
    .eq('session_id', session_id)
    .maybeSingle()

  if (fetchError || !qaSession) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Q&A session not found' } },
      { status: 404 },
    )
  }

  // Idempotency — already ended
  if (qaSession.status === 'ended') {
    const { data: existing } = await supabase
      .from('qa_sessions')
      .select('duration_seconds')
      .eq('id', qa_session_id)
      .single()
    return NextResponse.json({ status: 'ended', duration_seconds: existing?.duration_seconds ?? 0 })
  }

  const endedAt = new Date()
  const startedAt = qaSession.started_at ? new Date(qaSession.started_at) : endedAt
  const durationSeconds = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)

  // ── Update qa_session ────────────────────────────────────────────────
  const { error: updateError } = await supabase
    .from('qa_sessions')
    .update({
      status: 'ended',
      ended_at: endedAt.toISOString(),
      duration_seconds: durationSeconds,
      interruption_count,
    })
    .eq('id', qa_session_id)

  if (updateError) {
    console.error('[qa/end] Failed to update qa_session:', updateError)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Failed to finalize session' } },
      { status: 500 },
    )
  }

  // ── Transition session state to qa_completed ─────────────────────────
  // Only advance state — never move backwards (state machine is forward-only)
  const { data: sessionRow } = await supabase
    .from('sessions')
    .select('state')
    .eq('id', session_id)
    .single()

  const stateOrder = ['draft', 'brief_ready', 'pitch_recorded', 'qa_completed', 'debrief_ready', 'completed']
  const currentIdx = stateOrder.indexOf(sessionRow?.state ?? 'draft')
  const targetIdx  = stateOrder.indexOf('qa_completed')

  if (currentIdx < targetIdx) {
    await supabase
      .from('sessions')
      .update({ state: 'qa_completed' })
      .eq('id', session_id)
  }

  return NextResponse.json({ status: 'ended', duration_seconds: durationSeconds })
}
