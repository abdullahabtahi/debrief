import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

// GET /api/pitch/status?session_id=<uuid>
// Returns the current transcription status for the active pitch recording.
// Polled every 5 seconds by the frontend (TanStack Query refetchInterval).
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const session_id = searchParams.get('session_id')

  if (!session_id || !/^[0-9a-f-]{36}$/i.test(session_id)) {
    return NextResponse.json(
      { error: { code: 'INVALID_INPUT', message: 'session_id is required' } },
      { status: 400 }
    )
  }

  const supabase = getSupabase()

  const { data: recording, error } = await supabase
    .from('pitch_recordings')
    .select('status, transcript, transcript_quality, duration_seconds')
    .eq('session_id', session_id)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    console.error('[pitch/status] db error:', error)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Failed to fetch status' } },
      { status: 500 }
    )
  }

  if (!recording) {
    return NextResponse.json({ status: 'not_found' })
  }

  if (recording.status === 'ready') {
    // Fetch coaching tip from sessions table
    const { data: session } = await supabase
      .from('sessions')
      .select('coaching_tip')
      .eq('id', session_id)
      .single()

    return NextResponse.json({
      status:             'ready',
      transcript_preview: recording.transcript?.slice(0, 500) ?? null,
      quality:            recording.transcript_quality ?? null,
      coaching_tip:       session?.coaching_tip ?? null,
    })
  }

  if (recording.status === 'failed') {
    return NextResponse.json({ status: 'failed' })
  }

  return NextResponse.json({ status: recording.status })
}
