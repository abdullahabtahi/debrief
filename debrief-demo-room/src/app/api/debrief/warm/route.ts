import { z } from 'zod'
import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

const BodySchema = z.object({
  session_id: z.string().uuid(),
})

// POST /api/debrief/warm
// Pre-fetches session artifacts into Supabase hot path before the agent fires.
// Called on DebriefTriggerCard mount — fully transparent to user.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 })
  }
  const { session_id } = parsed.data
  const supabase = getSupabase()

  // Fire all reads in parallel to warm Supabase connection pool
  await Promise.all([
    supabase.from('project_briefs').select('extracted_summary').eq('session_id', session_id).eq('is_active', true).maybeSingle(),
    supabase.from('hackathon_briefs').select('extracted_summary').eq('session_id', session_id).eq('is_active', true).maybeSingle(),
    supabase.from('pitch_recordings').select('transcript').eq('session_id', session_id).eq('is_active', true).maybeSingle(),
    supabase.from('qa_sessions').select('id').eq('session_id', session_id).eq('status', 'ended').order('ended_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  return NextResponse.json({ warmed: true })
}
