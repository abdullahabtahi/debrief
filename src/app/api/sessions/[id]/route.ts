import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'

// GET /api/sessions/[id] — read a session by UUID
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { data, error } = await supabase
    .from('sessions')
    .select('id, session_code, state, title, coaching_tip, created_at')
    .eq('id', id)
    .single()

  if (error || !data) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Session not found' } },
      { status: 404 }
    )
  }

  // Count Q&A turns for the most recent ended qa_session (used by DebriefTriggerCard)
  const { count: qa_turn_count } = await supabase
    .from('qa_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', id)
    .eq('status', 'ended')
    .limit(1)
    .then(async ({ data: qaSessions }) => {
      if (!qaSessions?.length) return { count: 0 }
      const qaId = (qaSessions as { id: string }[])[0].id
      return supabase
        .from('qa_turns')
        .select('id', { count: 'exact', head: true })
        .eq('qa_session_id', qaId)
    })

  return NextResponse.json({ ...data, qa_turn_count: qa_turn_count ?? 0 })
}

const PatchSchema = z.object({
  title: z.string().min(1).max(120),
})

// PATCH /api/sessions/[id] — update session title
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const body = await req.json().catch(() => null)
  const parsed = PatchSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'INVALID_INPUT', message: 'Invalid payload', details: parsed.error.issues } },
      { status: 400 }
    )
  }

  const { error } = await supabase
    .from('sessions')
    .update({ title: parsed.data.title })
    .eq('id', id)

  if (error) {
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Failed to update session' } },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true })
}
