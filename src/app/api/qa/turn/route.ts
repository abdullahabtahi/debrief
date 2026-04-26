import { NextResponse } from 'next/server'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'

const VALID_SPEAKERS = ['founder', 'vc', 'domain_expert', 'user_advocate'] as const

const BodySchema = z.object({
  session_id: z.string().uuid(),
  qa_session_id: z.string().uuid(),
  sequence_number: z.number().int().min(0),
  speaker: z.enum(VALID_SPEAKERS),
  content: z.string(),
  timestamp_offset: z.number().int().min(0),
})

// GET /api/qa/turn?qa_session_id=...&session_id=...
// Returns all turns for a QA session ordered by sequence_number.
// Used by cold-reconnect flow to re-inject conversation history.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const qaSessionId = url.searchParams.get('qa_session_id')
  const sessionId = url.searchParams.get('session_id')

  if (!qaSessionId || !sessionId) {
    return NextResponse.json(
      { error: { code: 'INVALID_INPUT', message: 'qa_session_id and session_id are required' } },
      { status: 400 },
    )
  }

  // Verify ownership
  const { data: qaSession, error: qaError } = await supabase
    .from('qa_sessions')
    .select('id')
    .eq('id', qaSessionId)
    .eq('session_id', sessionId)
    .maybeSingle()

  if (qaError || !qaSession) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Q&A session not found' } },
      { status: 404 },
    )
  }

  const { data: turns, error } = await supabase
    .from('qa_turns')
    .select('sequence_number, speaker, content')
    .eq('qa_session_id', qaSessionId)
    .order('sequence_number', { ascending: true })

  if (error) {
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Failed to fetch turns' } },
      { status: 500 },
    )
  }

  return NextResponse.json({ turns: turns ?? [] })
}


// Writes a single Q&A turn incrementally.
// Uses ON CONFLICT DO NOTHING for safe retry semantics.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const parsed = BodySchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'INVALID_INPUT', message: parsed.error.issues[0].message } },
      { status: 400 },
    )
  }

  const { session_id, qa_session_id, sequence_number, speaker, content, timestamp_offset } =
    parsed.data

  // Verify the qa_session belongs to this session (prevents cross-session injection)
  const { data: qaSession, error: qaError } = await supabase
    .from('qa_sessions')
    .select('id, status')
    .eq('id', qa_session_id)
    .eq('session_id', session_id)
    .maybeSingle()

  if (qaError || !qaSession) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Q&A session not found' } },
      { status: 404 },
    )
  }

  // Upsert with ON CONFLICT DO NOTHING (unique index on qa_session_id, sequence_number)
  const { data, error } = await supabase
    .from('qa_turns')
    .upsert(
      { qa_session_id, sequence_number, speaker, content, timestamp_offset },
      { onConflict: 'qa_session_id,sequence_number', ignoreDuplicates: true },
    )
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('[qa/turn] Insert error:', error)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Failed to write turn' } },
      { status: 500 },
    )
  }

  return NextResponse.json({ id: data?.id ?? null }, { status: 201 })
}
