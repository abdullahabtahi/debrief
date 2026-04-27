'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion, useMotionValue } from 'framer-motion'

import { useSessionStore } from '@/stores/sessionStore'
import { useQAContext } from '@/hooks/useQAContext'
import { useGeminiLive, type ConnectionStatus } from '@/hooks/useGeminiLive'
import { useAudioPipeline } from '@/hooks/useAudioPipeline'
import { useTurnCapture, type Speaker, type Turn } from '@/hooks/useTurnCapture'
import { useHeartbeat } from '@/hooks/useHeartbeat'
import { buildJudgeSystemPrompt } from '@/lib/qaSystemPrompt'
import { markAudioStart, audioLog } from '@/lib/audioDiag'

import { JudgeIntroScreen } from './JudgeIntroScreen'
import { JudgeTile, JUDGE_CONFIG } from './JudgeTile'
import { UserPiP } from './UserPiP'
import { SessionProgressBar } from './SessionProgressBar'
import { SessionTimer } from './SessionTimer'
import { ConnectionStatusBanner } from './ConnectionStatusBanner'
import { QAControls } from './QAControls'
import { EndSessionModal } from './EndSessionModal'
import { LiveCaptionsPanel } from './LiveCaptionsPanel'
import { DeliberatingScreen } from './DeliberatingScreen'

interface QARoomProps {
  sessionId: string
}

type Phase = 'intro' | 'live' | 'deliberating'

export function QARoom({ sessionId }: QARoomProps) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('intro')

  // ── Context (brief + transcript) ─────────────────────────────────────
  const { data: qaContext, status: ctxStatus } = useQAContext(sessionId)

  const systemPrompt = useMemo(() => {
    if (!qaContext) return ''
    return buildJudgeSystemPrompt({
      projectSummary:   qaContext.projectSummary,
      hackathonSummary: qaContext.hackathonSummary,
      transcript:       qaContext.transcript,
    })
  }, [qaContext])

  // ── Live session state ────────────────────────────────────────────────
  const [connStatus, setConnStatus]     = useState<ConnectionStatus>('idle')
  const [initError, setInitError]       = useState<string | null>(null)
  const [activeSpeaker, setActiveSpeaker] = useState<Speaker | null>(null)
  const [subtitles, setSubtitles]       = useState<Record<string, string | null>>({
    vc: null, domain_expert: null, user_advocate: null,
  })
  // Streaming text fragment for the active judge — current sentence only (rolling window)
  const [streamingText, setStreamingText] = useState<string | null>(null)
  // Completed sentences for the caption strip history (sentence-boundary granularity)
  const [captionHistory, setCaptionHistory] = useState<Array<{ id: string; speaker: Speaker; text: string }>>([])

  const [isMuted, setIsMuted]           = useState(false)
  // MotionValue: updated by useAudioPipeline at audio-chunk rate without triggering re-renders
  const micLevelMV                      = useMotionValue(0)
  const [showEndModal, setShowEndModal] = useState(false)
  const setSessionState    = useSessionStore((s) => s.setSessionState)
  const [isEndingSession, setIsEndingSession] = useState(false)
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null)
  const [showEndingSoonBanner, setShowEndingSoonBanner] = useState(false)

  // ── Elapsed seconds — interval-driven so SessionProgressBar updates live ──
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  useEffect(() => {
    if (!sessionStartedAt) return
    const tick = () => {
      const secs = Math.floor((Date.now() - sessionStartedAt) / 1000)
      setElapsedSeconds(secs)
      // Show "Session ending in 3 minutes" banner from 12:00 to 15:00
      setShowEndingSoonBanner(secs >= 720 && secs < 900)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [sessionStartedAt])

  const qaSessionIdRef = useRef<string | null>(null)
  // Pre-created AudioContext: created synchronously in the click handler so it
  // starts in 'running' state before any useEffect or async code runs.
  const preCreatedPlaybackCtxRef = useRef<AudioContext | null>(null)
  // Stable getter reads latest ref value at call time — fixes null closure in useTurnCapture
  const getQaSessionId = useCallback(() => qaSessionIdRef.current, [])
  // Track whether we've already sent BEGIN_SESSION — must not resend on reconnect
  const hasKickedOffRef = useRef(false)
  // Track whether we've logged the first inbound audio chunk
  const firstAudioLoggedRef = useRef(false)

  // ── Heartbeat ─────────────────────────────────────────────────────────
  const { startHeartbeat, stopHeartbeat } = useHeartbeat(sessionId, getQaSessionId)

  // ── Turn capture ──────────────────────────────────────────────────────
  const { processMessage, flushPendingTurn, waitForGenerationComplete, freezeTurnCapture, getInterruptionCount, getSequenceCount } = useTurnCapture({
    sessionId,
    getQaSessionId,
    sessionStartedAt,
    callbacks: {
      onTurnComplete: () => {
        // DB write handled inside useTurnCapture; display history driven by onSentenceComplete
      },
      onSentenceComplete: (sentence, speaker) => {
        setCaptionHistory((prev) => [
          ...prev.slice(-2),
          { id: `s-${Date.now()}`, speaker, text: sentence },
        ])
      },
      onJudgeSubtitle: (text, speaker) => {
        if (!speaker) {
          setSubtitles((prev) => Object.fromEntries(Object.keys(prev).map((k) => [k, null])))
          setStreamingText(null)
        } else {
          setSubtitles((prev) => ({ ...prev, [speaker]: text }))
          setStreamingText(text)
        }
      },
      onActiveSpeakerChange: (speaker) => {
        setActiveSpeaker(speaker)
        if (!speaker) setStreamingText(null)
      },
      onInterruption: () => {
        flushPlayback()
        setActiveSpeaker(null)
        setSubtitles({ vc: null, domain_expert: null, user_advocate: null })
        setStreamingText(null)
      },
    },
  })

  // ── Audio pipeline (enabled only in 'live' phase) ─────────────────────
  const { enqueuePlaybackChunk, flushPlaybackQueue: flushPlayback, setMuted: setAudioMuted, micError } = useAudioPipeline({
    enabled: phase === 'live',
    preCreatedPlaybackCtx: preCreatedPlaybackCtxRef.current ?? undefined,
    callbacks: {
      onAudioChunk:     (base64) => sendAudioChunk(base64),
      onInterrupted:    () => flushPlayback(),
      onPlaybackStarted: () => {},
      onMicLevel:       (level) => micLevelMV.set(level),
    },
  })

  // ── Gemini Live ───────────────────────────────────────────────────────
  const { sendAudioChunk, sendAudioStreamEnd, sendRealtimeText, sendTextContent, closeSession } = useGeminiLive({
    sessionId,
    systemPrompt,
    enabled: phase === 'live',
    callbacks: {
      onMessage: (msg) => {
        const serverMsg = msg as Record<string, unknown>
        const sdkData = (msg as { data?: string }).data

        // Diagnostic: log every server message shape so we can see what arrives
        // between BEGIN_SESSION and first real audio.
        const msgKeys = Object.keys(serverMsg)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const scForLog = (serverMsg.serverContent ?? (serverMsg as any).server_content) as Record<string, unknown> | undefined
        const scKeys = scForLog ? Object.keys(scForLog) : []
        audioLog('Gemini msg', {
          keys: msgKeys,
          serverContentKeys: scKeys,
          sdkDataBytes: sdkData ? sdkData.length : 0,
          turnComplete: scForLog?.turnComplete,
          generationComplete: scForLog?.generationComplete,
        })

        // Primary: SDK LiveServerMessage.data getter
        if (sdkData) {
          if (!firstAudioLoggedRef.current) {
            firstAudioLoggedRef.current = true
            audioLog('FIRST audio chunk received from Gemini Live (sdk.data)', {
              chunkBytes: sdkData.length,
              playbackCtxState: preCreatedPlaybackCtxRef.current?.state,
            })
          }
          enqueuePlaybackChunk(sdkData)
        } else {
          // Fallback: manual extraction
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const sc = (serverMsg.serverContent ?? (serverMsg as any).server_content) as Record<string, unknown> | undefined
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const turn = (sc?.modelTurn ?? (sc as any)?.model_turn) as { parts?: unknown[] } | undefined
          if (turn?.parts) {
            for (const part of turn.parts) {
              const p = part as Record<string, unknown>
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const inline = (p.inlineData ?? (p as any).inline_data) as { data?: string; mimeType?: string } | undefined
              if (inline?.data) {
                if (!firstAudioLoggedRef.current) {
                  firstAudioLoggedRef.current = true
                  audioLog('FIRST audio chunk received via inlineData fallback', {
                    chunkBytes: inline.data.length,
                    mimeType: inline.mimeType,
                  })
                }
                enqueuePlaybackChunk(inline.data)
              }
            }
          }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sc = (serverMsg.serverContent ?? (serverMsg as any).server_content) as { interrupted?: boolean } | undefined
        if (sc?.interrupted === true) {
          flushPlayback()
        }

        processMessage(msg)
      },
      onConnectionStatusChange: (status) => {
        audioLog('Gemini Live connection status', { status })
        setConnStatus(status)
        if (status === 'live') startHeartbeat()
      },
      onSessionStarted: (qaSessionId, startedAt) => {
        qaSessionIdRef.current = qaSessionId
        setSessionStartedAt(startedAt)
      },
      onBootstrapError: (code, message) => {
        // Revert to intro so the user sees the error rather than a blank live room
        setPhase('intro')
        if (code === 'TRANSCRIPT_NOT_READY') {
          setInitError('Your transcript is still processing. Please wait a moment and try again.')
        } else {
          setInitError(message)
        }
      },
    },
  })

  // ── Kick off judges on first live connection ──────────────────────────
  // The system prompt tells judges: "Wait for the BEGIN_SESSION message."
  // We send it via sendRealtimeInput({ text }) which integrates with VAD
  // naturally. The 500ms delay ensures the playback pipeline (AudioWorklet)
  // is fully initialized (empirically ready by T+320ms) before the model's
  // first audio response arrives.
  //
  // History: previously used sendClientContent which caused a "silent compliance
  // turn" (model emitted silent ack before the real opening). Then the send was
  // removed entirely, causing a 23-second delay (empirically measured Apr 27).
  useEffect(() => {
    if (connStatus !== 'live') return
    if (hasKickedOffRef.current) return
    hasKickedOffRef.current = true

    // We must use sendTextContent (which uses sendClientContent with turnComplete: true)
    // because the Vertex AI backend (used in production) requires explicit turn completion
    // to trigger the model immediately. sendRealtimeInput works on the Gemini Developer API
    // but fails to trigger a prompt turn on Vertex AI.
    setTimeout(() => {
      sendTextContent('BEGIN_SESSION')
      audioLog('BEGIN_SESSION sent via sendTextContent (Vertex AI compatibility)')
    }, 500)
  }, [connStatus, sendTextContent])

  // ── End session flow ──────────────────────────────────────────────────
  const handleEndSessionConfirm = useCallback(async () => {
    if (isEndingSession) return
    setIsEndingSession(true)
    stopHeartbeat()
    setShowEndModal(false)

    // Freeze turn capture first — the closing ritual "Thank you. We'll deliberate."
    // must NOT be written to qa_turns (it's an artifact, not a scored turn)
    freezeTurnCapture()
    // Signal judges — they should deliver "Thank you. We'll deliberate."
    // turnComplete: true so Gemini knows we expect a response
    sendTextContent('SESSION_ENDING')
    // Wait for generation_complete (judge finishes closing line) or 4s hard cap
    await waitForGenerationComplete(4000)

    // Flush any in-progress turn
    await flushPendingTurn(2000)

    // Commit session to DB first — debrief page requires state = qa_completed.
    // On network or server error: reset so the user can retry; no navigation.
    const qaSessionId = qaSessionIdRef.current
    if (qaSessionId) {
      try {
        const res = await fetch('/api/qa/end', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            qa_session_id: qaSessionId,
            interruption_count: getInterruptionCount(),
          }),
        })
        if (!res.ok) throw new Error(`/api/qa/end returned ${res.status}`)
      } catch (err) {
        console.error('[QARoom] /api/qa/end failed:', err)
        setIsEndingSession(false)
        return
      }
    }

    // Sync Zustand so the debrief page lock check passes immediately
    setSessionState('qa_completed')

    // DB committed — safe to enter cinematic deliberating screen
    setPhase('deliberating')
    closeSession()
  }, [
    isEndingSession,
    stopHeartbeat,
    freezeTurnCapture,
    sendTextContent,
    waitForGenerationComplete,
    flushPendingTurn,
    sessionId,
    getInterruptionCount,
    closeSession,
    setSessionState,
  ])

  // Called by DeliberatingScreen after its animation finishes
  const handleDeliberatingComplete = useCallback(() => {
    router.push(`/session/${sessionId}/debrief/review`)
  }, [router, sessionId])

  // ── Mute toggle ───────────────────────────────────────────────────────
  const handleToggleMute = useCallback(() => {
    const next = !isMuted
    setIsMuted(next)
    setAudioMuted(next)
    // Per skill best practices: when mic pauses, send audioStreamEnd so the
    // server flushes cached audio. Without this the server keeps waiting,
    // delaying the next response when unmuted.
    if (next) sendAudioStreamEnd()
  }, [isMuted, setAudioMuted, sendAudioStreamEnd])

  // ── Intro → live transition (MUST be synchronous inside click handler) ─
  const handleIntroReady = useCallback(() => {
    setInitError(null) // clear any prior error on retry
    markAudioStart('handleIntroReady clicked')
    // Create AudioContext HERE — synchronously inside the click handler.
    // This is the only reliable way to guarantee 'running' state on Chrome/Safari.
    if (!preCreatedPlaybackCtxRef.current) {
      const ctx = new AudioContext({ sampleRate: 24000 })
      preCreatedPlaybackCtxRef.current = ctx
      audioLog('playback AudioContext created (synchronous, in click handler)', {
        state: ctx.state,
        sampleRate: ctx.sampleRate,
        baseLatency: ctx.baseLatency,
      })
    } else {
      audioLog('playback AudioContext already existed', {
        state: preCreatedPlaybackCtxRef.current.state,
      })
    }
    audioLog('phase → live')
    setPhase('live')
  }, [])

  // ── Deliberating phase ────────────────────────────────────────────────
  // We keep the main view mounted but render DeliberatingScreen as an overlay
  // so the background stays visible but blurred.

  // ── Intro phase ───────────────────────────────────────────────────────
  if (phase === 'intro') {
    return (
      <JudgeIntroScreen
        onReady={handleIntroReady}
        contextStatus={ctxStatus === 'idle' ? 'loading' : ctxStatus}
        initError={initError}
      />
    )
  }

  // ── Live phase ─────────────────────────────────────────────────────────
  return (
    // The Light & Airy Cinematic Stage
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#f9f9ff] text-slate-900 overflow-hidden font-sans">
      
      {/* Cinematic Header Gradient */}
      <div className="absolute top-0 left-0 right-0 h-[50vh] pointer-events-none z-0" 
           style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(135,165,230,0.15), transparent 70%)' }} />

      {/* Deliberating Screen Overlay */}
      <AnimatePresence>
        {phase === 'deliberating' && (
          <DeliberatingScreen onComplete={handleDeliberatingComplete} />
        )}
      </AnimatePresence>

      <div className={`relative z-10 flex-1 flex flex-col min-h-0 transition-all duration-1000 ${phase === 'deliberating' ? 'blur-xl opacity-30 scale-[0.98] pointer-events-none' : ''}`}>

        {/* Top bar: progress + timer + connection */}
        <div className="relative shrink-0">
          <SessionProgressBar elapsedSeconds={elapsedSeconds} />
          <ConnectionStatusBanner
            status={connStatus}
            onRetry={() => window.location.reload()}
          />
          <div className="flex items-center justify-between px-8 pt-6 pb-3">
            {/* Session label */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">Q&amp;A Room</span>
            </div>
            {/* Timer — centered, prominent */}
            <SessionTimer
              startedAt={sessionStartedAt}
              onSoftCap={() => {}}
              onHardCap={handleEndSessionConfirm}
            />
            {/* right spacer */}
            <div className="w-16" />
          </div>
        </div>

        {/* Stage: Google Meet-style layout — founder dominant (left), judges side-rail (right) */}
        <main className="relative flex-1 flex gap-5 px-6 pb-2 min-h-0">
          {/* LEFT — Founder dominant tile */}
          <div className="relative flex-1 min-w-0 flex items-stretch">
            {micError && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30">
                <div className="bg-red-50 text-red-600 text-xs rounded-full px-3 py-1.5 border border-red-200 shadow-sm">
                  {micError}
                </div>
              </div>
            )}
            <UserPiP
              variant="dominant"
              micLevel={micLevelMV}
              isJudgeSpeaking={!!activeSpeaker && activeSpeaker !== 'founder'}
            />
            {/* Live captions overlay — only rendered when there is content */}
            {(streamingText || captionHistory.length > 0) && (
              <div className="absolute bottom-6 left-6 right-6 z-20 pointer-events-none">
                <div className="rounded-2xl bg-white/80 backdrop-blur-md px-4 py-2.5 shadow-sm border border-white/60">
                  <LiveCaptionsPanel
                    activeSpeaker={activeSpeaker}
                    streamingText={streamingText}
                    captionHistory={captionHistory}
                  />
                </div>
              </div>
            )}
          </div>

          {/* RIGHT — Judges side rail (vertical column of 3 restored tiles) */}
          <aside className="w-[300px] shrink-0 flex flex-col gap-3">
            {JUDGE_CONFIG.map((judge) => (
              <JudgeTile
                key={judge.id}
                judgeId={judge.id}
                isActiveSpeaker={activeSpeaker === judge.id}
                currentSubtitle={subtitles[judge.id] ?? null}
                compact
              />
            ))}
          </aside>

          {/* 12-min warning toast */}
          <AnimatePresence>
            {showEndingSoonBanner && (
              <motion.div
                className="absolute top-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 rounded-full bg-amber-50 border border-amber-200 shadow-sm px-5 py-2"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-xs text-amber-700 font-semibold">3 minutes remaining</span>
                <button
                  onClick={() => setShowEndingSoonBanner(false)}
                  className="text-amber-400 hover:text-amber-600 text-xs ml-1"
                >
                  ✕
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Cold-start spinner */}
        <AnimatePresence>
          {connStatus === 'connecting' && (
            <motion.div
              className="absolute inset-0 flex items-center justify-center z-30 bg-white/70 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="flex flex-col items-center gap-4">
                <motion.div
                  className="w-8 h-8 rounded-full border-2 border-slate-400 border-t-transparent"
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
                />
                <p className="text-sm text-slate-600 font-medium">Judges are reviewing your brief&hellip;</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Controls */}
        <footer className="px-8 pb-6 pt-2 shrink-0">
          <QAControls
            isMuted={isMuted}
            onToggleMute={handleToggleMute}
            onEndSession={() => setShowEndModal(true)}
            disabled={isEndingSession}
          />
        </footer>
      </div>

      <EndSessionModal
        isOpen={showEndModal}
        turnCount={getSequenceCount()}
        isClosing={isEndingSession}
        onConfirm={handleEndSessionConfirm}
        onCancel={() => !isEndingSession && setShowEndModal(false)}
      />
    </div>
  )
}
