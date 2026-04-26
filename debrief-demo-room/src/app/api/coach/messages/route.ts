import { z } from 'zod'
import { getSupabase } from '@/lib/supabase'

// ── Schema ────────────────────────────────────────────────────────────────────

const QuerySchema = z.object({
  session_id: z.string().uuid('session_id must be a valid UUID'),
})

// ── GET /api/coach/messages?session_id= ──────────────────────────────────────
// Returns the active debrief ID, all coach messages, and opening prompt chips.

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const session_id = searchParams.get('session_id')

  const parsed = QuerySchema.safeParse({ session_id })
  if (!parsed.success) {
    return Response.json(
      { error: { code: 'INVALID_INPUT', message: parsed.error.issues[0].message } },
      { status: 400 },
    )
  }

  const supabase = getSupabase()

  // Resolve active debrief for session
  const { data: debrief, error: debriefErr } = await supabase
    .from('debriefs')
    .select('id, coach_opening_prompts, status')
    .eq('session_id', parsed.data.session_id)
    .eq('is_active', true)
    .maybeSingle()

  if (debriefErr) {
    return Response.json({ error: { code: 'DB_ERROR', message: debriefErr.message } }, { status: 500 })
  }

  if (!debrief) {
    return Response.json(
      { error: { code: 'NO_DEBRIEF', message: 'No active debrief found for this session' } },
      { status: 404 },
    )
  }

  if (debrief.status !== 'complete') {
    return Response.json(
      { error: { code: 'DEBRIEF_INCOMPLETE', message: 'Debrief is not yet complete' } },
      { status: 422 },
    )
  }

  // Fetch all messages for this debrief, ordered by sequence_number
  const { data: messages, error: msgErr } = await supabase
    .from('coach_messages')
    .select('id, role, content, sequence_number, is_summary, created_at')
    .eq('debrief_id', debrief.id)
    .order('sequence_number', { ascending: true })

  if (msgErr) {
    return Response.json({ error: { code: 'DB_ERROR', message: msgErr.message } }, { status: 500 })
  }

  return Response.json({
    debrief_id: debrief.id,
    messages: messages ?? [],
    coach_opening_prompts: debrief.coach_opening_prompts ?? null,
  })
}
