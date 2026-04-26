import { NextResponse } from 'next/server'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'

// GET /api/qa/context?session_id=<uuid>
// Returns the three context sources needed to build the judge system prompt:
//   - hackathon brief extracted_summary
//   - project brief extracted_summary
//   - pitch transcript
// Called client-side before token issuance; no auth token needed (service-role
// key is server-only and this route acts as a safe proxy).
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const session_id = searchParams.get('session_id')

  if (!session_id || !/^[0-9a-f-]{36}$/.test(session_id)) {
    return NextResponse.json(
      { error: { code: 'INVALID_INPUT', message: 'session_id is required' } },
      { status: 400 },
    )
  }

  const [
    { data: projectBrief },
    { data: hackathonBrief },
    { data: pitchRecording },
  ] = await Promise.all([
    supabase
      .from('project_briefs')
      .select('extracted_summary')
      .eq('session_id', session_id)
      .eq('is_active', true)
      .maybeSingle(),
    supabase
      .from('hackathon_briefs')
      .select('extracted_summary')
      .eq('session_id', session_id)
      .eq('is_active', true)
      .maybeSingle(),
    supabase
      .from('pitch_recordings')
      .select('transcript')
      .eq('session_id', session_id)
      .eq('is_active', true)
      .maybeSingle(),
  ])

  return NextResponse.json({
    project_summary: projectBrief?.extracted_summary ?? null,
    hackathon_summary: hackathonBrief?.extracted_summary ?? null,
    transcript: pitchRecording?.transcript ?? null,
  })
}
