'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type ConnectionStatus = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'lost'

export interface GeminiLiveCallbacks {
  /** Raw server message — used by useTurnCapture and useAudioPipeline */
  onMessage: (msg: unknown) => void
  onConnectionStatusChange: (status: ConnectionStatus) => void
  onSessionStarted: (qaSessionId: string, startedAt: number) => void
  /** Called when token issuance fails with a known code (e.g. TRANSCRIPT_NOT_READY) */
  onBootstrapError?: (code: string, message: string) => void
}

interface TokenResponse {
  access_token: string  // ephemeral token, format: "auth_tokens/..."
  model: string
  qa_session_id: string
}

interface UseGeminiLiveOptions {
  sessionId: string
  systemPrompt: string
  callbacks: GeminiLiveCallbacks
  /** Called when the session is ready to open (AudioContext must be created first) */
  enabled: boolean
}

const MAX_RECONNECT_DELAY_MS = 30_000
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 15000, 30000]

// useGeminiLive
// Manages the full Gemini Live WebSocket lifecycle:
//   - Token issuance
//   - WebSocket connection via @google/genai
//   - SessionResumptionUpdate handle tracking
//   - GoAway graceful reconnect
//   - Exponential backoff for network drops
//   - System prompt injection on open
export function useGeminiLive({
  sessionId,
  systemPrompt,
  callbacks,
  enabled,
}: UseGeminiLiveOptions) {
  const [status, setStatus] = useState<ConnectionStatus>('idle')
  const sessionRef          = useRef<{ close: () => void; sendClientContent: (p: unknown) => void; sendRealtimeInput: (p: unknown) => void } | null>(null)
  const tokenDataRef        = useRef<TokenResponse | null>(null)
  const resumptionHandleRef = useRef<string | null>(null)
  const reconnectAttemptRef = useRef(0)
  const reconnectTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isEndingRef         = useRef(false)
  const qaSessionIdRef      = useRef<string | null>(null)
  const sessionStartedAtRef = useRef<number | null>(null)
  const hasEverConnectedRef = useRef(false) // distinguishes first connect from cold reconnect
  const mountedRef          = useRef(true)
  // Store callbacks in a ref so issueToken/openConnection have stable identities.
  // Without this, every QARoom render (state changes, mic level, etc.) creates a new
  // callbacks object → new issueToken/openConnection → bootstrap effect re-runs →
  // concurrent fetch('/api/qa/token') storm → Chrome ERR_INSUFFICIENT_RESOURCES.
  const callbacksRef        = useRef(callbacks)
  useEffect(() => { callbacksRef.current = callbacks })

  const updateStatus = useCallback((s: ConnectionStatus) => {
    setStatus(s)
    callbacksRef.current.onConnectionStatusChange(s)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // stable — callbacksRef never changes identity

  // ── Token issuance ────────────────────────────────────────────────────
  const issueToken = useCallback(async (): Promise<TokenResponse | null> => {
    try {
      const res = await fetch('/api/qa/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { code?: string; message?: string } }
        const code = body?.error?.code ?? 'TOKEN_ERROR'
        const message = body?.error?.message ?? `Token request failed: ${res.status}`
        callbacksRef.current.onBootstrapError?.(code, message)
        return null
      }
      return res.json() as Promise<TokenResponse>
    } catch (err) {
      console.error('[useGeminiLive] Token issuance failed:', err)
      callbacksRef.current.onBootstrapError?.('TOKEN_ERROR', 'Failed to connect. Please try again.')
      return null
    }
  // callbacks deliberately excluded — using callbacksRef for stable identity
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  // ── Open WebSocket ────────────────────────────────────────────────────
  const openConnection = useCallback(async (resumeHandle: string | null) => {
    if (!mountedRef.current) return

    updateStatus('connecting')

    // Lazily import to avoid SSR issues
    const { GoogleGenAI } = await import('@google/genai')

    const tokenData = tokenDataRef.current
    if (!tokenData) {
      updateStatus('lost')
      return
    }

    // Initialize @google/genai with Gemini Developer API + ephemeral token.
    // Browser WebSockets cannot pass Authorization headers, so Vertex direct
    // browser auth is impossible. The Gemini Dev API accepts ephemeral tokens
    // via URL query string, which the SDK handles internally when the apiKey
    // starts with "auth_tokens/". v1alpha is required for ephemeral support.
    const ai = new GoogleGenAI({
      apiKey: tokenData.access_token,
      httpOptions: { apiVersion: 'v1alpha' },
    })

    // Per official gemini-live-api-dev skill (Apr 2026):
    //   - systemInstruction is a SETUP-time field
    //   - speechConfig with prebuiltVoiceConfig is rejected on native-audio
    //     models (gemini-3.1-flash-live-preview). Defaults give a fine voice.
    //   - VAD tuned for a Q&A panel: founders pause to think; END_SENSITIVITY_LOW
    //     + 600ms silenceDurationMs prevents judges cutting in mid-thought.
    const config: Record<string, unknown> = {
      responseModalities: ['AUDIO'],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      outputAudioTranscription: {},
      inputAudioTranscription: {},
      contextWindowCompression: { slidingWindow: {} },
      sessionResumption: resumeHandle ? { handle: resumeHandle } : {},
      realtimeInputConfig: {
        automaticActivityDetection: {
          startOfSpeechSensitivity: 'START_SENSITIVITY_LOW',
          endOfSpeechSensitivity:   'END_SENSITIVITY_LOW',
          prefixPaddingMs:   200,
          silenceDurationMs: 600,
        },
      },
    }

    try {
      const session = await ai.live.connect({
        model: tokenData.model,
        config,
        callbacks: {
          onopen: () => {
            // NOTE: do NOT touch `session` here — TDZ. The SDK awaits this
            // open event internally before `connect()` resolves, so we run
            // post-open initialization after the await below.
            if (!mountedRef.current) return
            reconnectAttemptRef.current = 0
            updateStatus('live')
          },

          onmessage: (msg: unknown) => {
            if (!mountedRef.current) return

            // Track resumption handle
            const m = msg as Record<string, unknown>
            const resumptionUpdate = m?.sessionResumptionUpdate as Record<string, unknown> | undefined
            if (resumptionUpdate?.newHandle && resumptionUpdate?.resumable) {
              resumptionHandleRef.current = resumptionUpdate.newHandle as string
            }

            // Per skill: log usageMetadata for token-cost visibility.
            const usage = m?.usageMetadata as { totalTokenCount?: number } | undefined
            if (usage?.totalTokenCount) {
              console.debug('[useGeminiLive] tokens:', usage.totalTokenCount)
            }

            // Handle GoAway — graceful reconnect before forced disconnect
            const goAway = m?.goAway as Record<string, unknown> | undefined
            if (goAway) {
              const timeLeftStr = goAway.timeLeft as string | undefined
              const timeLeftMs = timeLeftStr ? parseTimeLeft(timeLeftStr) : 0
              if (timeLeftMs < 3000) {
                console.log('[useGeminiLive] GoAway received, reconnecting...')
                reconnect(resumptionHandleRef.current)
              }
            }

            callbacksRef.current.onMessage(msg)
          },

          onerror: (err: unknown) => {
            console.error('[useGeminiLive] WebSocket error:', err)
          },

          onclose: (event: unknown) => {
            const e = event as CloseEvent
            if (!mountedRef.current || isEndingRef.current) return
            console.warn('[useGeminiLive] Connection closed unexpectedly. code:', e?.code)
            reconnect(resumptionHandleRef.current)
          },
        },
      })

      sessionRef.current = session as typeof sessionRef.current

      // ── Post-open initialization (WS is open by the time await resolves) ──
      const now = Date.now()
      sessionStartedAtRef.current = now

      if (qaSessionIdRef.current) {
        fetch('/api/qa/session', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            qa_session_id: qaSessionIdRef.current,
            session_id: sessionId,
          }),
        }).catch((err) => console.warn('[useGeminiLive] started_at PATCH failed:', err))

        callbacksRef.current.onSessionStarted(qaSessionIdRef.current, now)
      }

      // History reinjection on cold reconnect would require
      // history_config: { initial_history_in_client_content: true } in the
      // setup config (per gemini-live-api-dev skill). Skipping for now —
      // sessionResumption handle is the supported path. The mic stream
      // (sendRealtimeInput) will drive model responses.

      hasEverConnectedRef.current = true
    } catch (err) {
      console.error('[useGeminiLive] connect() failed:', err)
      if (mountedRef.current && !isEndingRef.current) {
        reconnect(resumptionHandleRef.current)
      }
    }
  // callbacks deliberately excluded — using callbacksRef
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, systemPrompt, updateStatus])

  // ── Reconnect with exponential backoff ────────────────────────────────
  const reconnect = useCallback((handle: string | null) => {
    if (!mountedRef.current || isEndingRef.current) return

    updateStatus('reconnecting')
    const attempt = reconnectAttemptRef.current
    const delay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)]

    if (delay >= MAX_RECONNECT_DELAY_MS) {
      updateStatus('lost')
      return
    }

    reconnectAttemptRef.current += 1

    reconnectTimerRef.current = setTimeout(async () => {
      if (!mountedRef.current) return
      // If we have a handle, try with it; if not, cold fallback
      await openConnection(handle)
    }, delay)
  }, [openConnection, updateStatus])

  // ── Send audio chunk ─────────────────────────────────────────────────
  // Per skill: use `audio` key, NOT `media`. `media` is the legacy alias and
  // is rejected by gemini-3.1-flash-live-preview.
  const sendAudioChunk = useCallback((base64: string) => {
    sessionRef.current?.sendRealtimeInput({
      audio: { data: base64, mimeType: 'audio/pcm;rate=16000' },
    })
  }, [])
  // ── Signal end-of-stream (mic paused / muted) ────────────────────
  // Per skill best practices: when the mic is paused, send audioStreamEnd
  // to flush any cached audio on the server. Without this, the server keeps
  // waiting for more audio to complete the current activity, delaying responses.
  const sendAudioStreamEnd = useCallback(() => {
    sessionRef.current?.sendRealtimeInput({ audioStreamEnd: true })
  }, [])
  // ── Send text via realtime input (VAD-integrated) ──────────────────────
  // Per Gemini Live API skill (2026): "Use sendRealtimeInput for ALL real-time
  // user input (audio, video, and text)." This integrates with VAD naturally
  // and does NOT force an explicit turn boundary.
  // Use this for BEGIN_SESSION kickoff — sendClientContent caused a "silent
  // compliance turn" because it forced a turn boundary before the real opening.
  const sendRealtimeText = useCallback((text: string) => {
    sessionRef.current?.sendRealtimeInput({ text })
  }, [])
  // ── Send text content (explicit turn) ──────────────────────────────────
  // Uses sendClientContent with turnComplete: true to force a deterministic
  // model response. Reserved for SESSION_ENDING where we NEED the model to
  // respond with exactly one closing line before we close the WebSocket.
  // Do NOT use for BEGIN_SESSION — it causes a silent compliance turn.
  const sendTextContent = useCallback((text: string) => {
    sessionRef.current?.sendClientContent({ turns: text, turnComplete: true })
  }, [])

  // ── Close session cleanly ─────────────────────────────────────────────
  const closeSession = useCallback(() => {
    isEndingRef.current = true
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
    sessionRef.current?.close()
    sessionRef.current = null
    updateStatus('idle')
  }, [updateStatus])

  // ── Bootstrap ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return
    mountedRef.current = true
    isEndingRef.current = false

    const bootstrap = async () => {
      const tokenData = await issueToken()
      if (!tokenData || !mountedRef.current) return

      tokenDataRef.current = tokenData
      qaSessionIdRef.current = tokenData.qa_session_id

      await openConnection(null)
    }

    bootstrap()

    return () => {
      mountedRef.current = false
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      sessionRef.current?.close()
      sessionRef.current = null
    }
  }, [enabled, issueToken, openConnection])

  return {
    status,
    qaSessionId: qaSessionIdRef.current,
    sessionStartedAt: sessionStartedAtRef.current,
    sendAudioChunk,
    sendAudioStreamEnd,
    sendRealtimeText,
    sendTextContent,
    closeSession,
  }
}

// Parse GoAway.timeLeft from proto Duration string e.g. "5s", "1.5s"
function parseTimeLeft(timeLeft: string): number {
  const match = timeLeft.match(/^([\d.]+)s$/)
  if (!match) return 0
  return parseFloat(match[1]) * 1000
}
