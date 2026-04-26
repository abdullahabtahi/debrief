import { NextResponse } from 'next/server'
import { z } from 'zod'
import { GoogleGenAI } from '@google/genai'
import { supabase } from '@/lib/supabase'
import { rateLimit, getClientIp, tooManyRequests } from '@/lib/rateLimit'

const BodySchema = z.object({
  session_id: z.string().uuid(),
})

// POST /api/qa/token
// Issues a short-lived Google OAuth access token (Vertex AI pattern) and
// creates a qa_sessions record. Returns the token + session metadata so the
// browser can initialize @google/genai with { vertexai: true }.
//
// SECURITY: OIDC verification not required here because this is an
// app-initiated route (session_id is a UUID controlled by the app, not a
// public endpoint). Rate-limited per IP to prevent quota burn — Gemini Live
// token minting is the most expensive endpoint.
export async function POST(req: Request) {
  const ip = getClientIp(req)
  const rl = rateLimit(`qa-token:${ip}`, 10, 60) // 10 tokens / minute / IP
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec)

  const body = await req.json().catch(() => null)
  const parsed = BodySchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'INVALID_INPUT', message: parsed.error.issues[0].message } },
      { status: 400 },
    )
  }

  const { session_id } = parsed.data

  // ── 1. Verify session exists and is in the right state ────────────────
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, state')
    .eq('id', session_id)
    .single()

  if (sessionError || !session) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Session not found' } },
      { status: 404 },
    )
  }

  if (!['pitch_recorded', 'qa_completed', 'debrief_ready', 'completed'].includes(session.state)) {
    return NextResponse.json(
      { error: { code: 'INVALID_STATE', message: 'Pitch must be recorded before entering Q&A' } },
      { status: 422 },
    )
  }

  // ── 2. Get the active pitch recording for this session ────────────────
  const { data: pitchRecording, error: pitchError } = await supabase
    .from('pitch_recordings')
    .select('id, status')
    .eq('session_id', session_id)
    .eq('is_active', true)
    .maybeSingle()

  if (pitchError || !pitchRecording || pitchRecording.status !== 'ready') {
    return NextResponse.json(
      {
        error: {
          code: 'TRANSCRIPT_NOT_READY',
          message: 'Transcript is not ready yet. Please wait for processing to complete.',
        },
      },
      { status: 422 },
    )
  }

  // ── 3. Mint ephemeral auth token (Gemini Developer API) ───────────────
  // Browser WebSockets cannot pass Authorization headers, so Vertex AI direct
  // browser auth is impossible. We use Gemini Developer API ephemeral tokens
  // which are passed via URL query (`?access_token=auth_tokens/...`).
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: { code: 'CONFIG_ERROR', message: 'GEMINI_API_KEY missing on server' } },
      { status: 500 },
    )
  }

  let ephemeralToken: string
  try {
    const ai = new GoogleGenAI({
      vertexai: false, // Override GOOGLE_GENAI_USE_VERTEXAI env — authTokens only works on Gemini Developer API
      apiKey,
      httpOptions: { apiVersion: 'v1alpha' }, // Required for ephemeral tokens
    })
    // Token is single-use for connection (uses=1) and expires in 10 minutes.
    // Live session, once connected, persists for the full session lifetime.
    const expireTime = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    const tokenResource = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime,
      },
    })
    if (!tokenResource.name) throw new Error('Ephemeral token missing name')
    ephemeralToken = tokenResource.name // format: "auth_tokens/abc123..."
  } catch (err) {
    console.error('[qa/token] Failed to mint ephemeral token:', err)
    return NextResponse.json(
      { error: { code: 'AUTH_ERROR', message: 'Failed to issue access token' } },
      { status: 500 },
    )
  }

  // ── 4. Create qa_sessions record ─────────────────────────────────────
  // Deduplication: if there is already an active qa_session for this session
  // that has NOT started yet (no started_at), reuse it instead of inserting a
  // new row. This prevents thousands of orphaned rows on reconnect/refresh.
  // If an active session exists with started_at set, mark it abandoned first.
  const { data: existingActive } = await supabase
    .from('qa_sessions')
    .select('id, started_at')
    .eq('session_id', session_id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let qaSessionId: string

  if (existingActive && !existingActive.started_at) {
    // Reuse unstarted session — just update the pitch_recording_id
    await supabase
      .from('qa_sessions')
      .update({ pitch_recording_id: pitchRecording.id })
      .eq('id', existingActive.id)
    qaSessionId = existingActive.id
  } else {
    // Mark any existing active sessions as abandoned, then create fresh row
    if (existingActive) {
      await supabase
        .from('qa_sessions')
        .update({ status: 'abandoned', ended_at: new Date().toISOString() })
        .eq('session_id', session_id)
        .eq('status', 'active')
    }

    const { data: qaSession, error: qaError } = await supabase
      .from('qa_sessions')
      .insert({
        session_id,
        pitch_recording_id: pitchRecording.id,
        status: 'active',
        interruption_count: 0,
      })
      .select('id')
      .single()

    if (qaError || !qaSession) {
      console.error('[qa/token] Failed to create qa_session:', qaError)
      return NextResponse.json(
        { error: { code: 'DB_ERROR', message: 'Failed to create Q&A session record' } },
        { status: 500 },
      )
    }

    qaSessionId = qaSession.id
  }

  const model = process.env.GEMINI_LIVE_MODEL ?? 'gemini-3.1-flash-live-preview'

  return NextResponse.json(
    {
      access_token: ephemeralToken,
      model,
      qa_session_id: qaSessionId,
    },
    { status: 200 },
  )
}
