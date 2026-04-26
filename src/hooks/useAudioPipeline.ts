'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { audioLog, audioWarn } from '@/lib/audioDiag'

export interface AudioPipelineCallbacks {
  onAudioChunk: (base64: string) => void
  onInterrupted: () => void
  onPlaybackStarted: () => void
  onMicLevel: (level: number) => void // 0-1, for VAD ring
}

interface UseAudioPipelineOptions {
  callbacks: AudioPipelineCallbacks
  /** Must be called inside a user gesture to satisfy AudioContext autoplay policy */
  enabled: boolean
  /**
   * Pre-created AudioContext for playback, created synchronously inside the
   * button click handler so it starts in 'running' state (not 'suspended').
   *
   * Why this matters: React effects run asynchronously after render, outside
   * the original user gesture context. Any AudioContext created inside a
   * useEffect starts in 'suspended' state on Chrome/Safari — requiring a
   * resume() call that may itself race with the first audio packets from
   * Gemini Live. Passing a pre-created context that was created synchronously
   * in the click handler guarantees it is already 'running' when setup runs.
   */
  preCreatedPlaybackCtx?: AudioContext
}

// useAudioPipeline
// Sets up the full browser audio pipeline:
//   Mic → AudioWorklet (capture-processor.js) → PCM 16kHz → sendAudioChunk()
//   WebSocket audio → Int16Array → AudioWorklet (playback-processor.js) → Speakers
//
// CRITICAL: preCreatedPlaybackCtx MUST be created synchronously inside the
// user gesture handler (button click) — NOT inside a useEffect or async
// callback. Browsers enforce that AudioContext starts 'running' only when
// created within the synchronous call stack of a user input event.
export function useAudioPipeline({ callbacks, enabled, preCreatedPlaybackCtx }: UseAudioPipelineOptions) {
  const [micGranted, setMicGranted] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)

  const captureCtxRef   = useRef<AudioContext | null>(null)
  const playbackCtxRef  = useRef<AudioContext | null>(null)
  const captureNodeRef  = useRef<AudioWorkletNode | null>(null)
  const playbackNodeRef = useRef<AudioWorkletNode | null>(null)
  const streamRef       = useRef<MediaStream | null>(null)
  const isMutedRef      = useRef(false)
  const mountedRef      = useRef(true)
  // Buffer for audio chunks that arrive before the playback node is ready.
  // Race condition: WebSocket connects and Gemini sends audio within ~100ms,
  // but AudioContext init (getUserMedia + addModule) takes ~500ms-1s.
  const pendingChunksRef = useRef<string[]>([])
  // Store callbacks in a ref so the setup effect doesn't re-run when caller
  // re-renders with a new inline callbacks object reference.
  const callbacksRef    = useRef(callbacks)
  useEffect(() => { callbacksRef.current = callbacks })

  // ── Decode base64 PCM and post to worklet ────────────────────────────
  const decodeAndPost = useCallback((base64: string, node: AudioWorkletNode) => {
    try {
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }
      const buffer = bytes.buffer.slice(0) as ArrayBuffer
      node.port.postMessage(buffer, [buffer])
    } catch (err) {
      console.error('[useAudioPipeline] decodeAndPost failed — invalid base64?', err)
    }
  }, [])

  // ── Receive audio from Gemini Live and queue for playback ─────────────
  // The AudioContext can silently re-suspend at any time (Chrome autoplay
  // policy, tab focus change, OS audio session). If we post chunks to the
  // worklet while the context is suspended, the worklet queues them but the
  // destination outputs silence — the user hears nothing. We must always
  // ensure the context is running BEFORE posting, and surface resume failures
  // so they don't fail invisibly.
  const enqueuePlaybackChunk = useCallback(async (base64: string) => {
    if (!playbackNodeRef.current) {
      pendingChunksRef.current.push(base64)
      audioLog('enqueue: node not ready, buffered to pendingChunks', {
        bufferedSize: pendingChunksRef.current.length,
        chunkBytes: base64.length,
      })
      return
    }
    const ctx = playbackCtxRef.current
    if (ctx && ctx.state !== 'running') {
      audioWarn('enqueue: ctx NOT running before post — attempting resume', { state: ctx.state })
      try {
        await ctx.resume()
        audioLog('enqueue: resume awaited', { state: ctx.state })
      } catch (err) {
        audioWarn('enqueue: resume rejected — audio will be silent', { err: String(err) })
      }
    }
    if (!playbackNodeRef.current) return // ref cleared during await
    decodeAndPost(base64, playbackNodeRef.current)
    callbacksRef.current.onPlaybackStarted()
  }, [decodeAndPost])

  // ── Clear audio queue immediately (interruption / barge-in) ──────────
  const flushPlaybackQueue = useCallback(() => {
    playbackNodeRef.current?.port.postMessage('flush')
  }, [])

  // ── Toggle mute ───────────────────────────────────────────────────────
  const setMuted = useCallback((muted: boolean) => {
    isMutedRef.current = muted
  }, [])

  // ── Initialize audio pipeline on user gesture ─────────────────────────
  useEffect(() => {
    if (!enabled) return
    mountedRef.current = true

    const setup = async () => {
      audioLog('setup() started', { preCreatedPlaybackCtx: !!preCreatedPlaybackCtx })
      try {
        // Request mic
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: { ideal: 48000 },
          },
        })
        audioLog('getUserMedia resolved')
        if (!mountedRef.current) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        setMicGranted(true)

        // ── Capture context (mic → 16kHz chunks) ──────────────────────
        const captureCtx = new AudioContext()
        captureCtxRef.current = captureCtx
        audioLog('capture AudioContext created', { state: captureCtx.state, sampleRate: captureCtx.sampleRate })
        await captureCtx.audioWorklet.addModule('/worklets/capture-processor.js')
        audioLog('capture worklet module loaded', { state: captureCtx.state })

        // Guard: cleanup may have closed the context while addModule awaited
        if (!mountedRef.current || captureCtx.state === 'closed') return

        const sourceNode  = captureCtx.createMediaStreamSource(stream)
        const captureNode = new AudioWorkletNode(captureCtx, 'capture-processor')
        captureNodeRef.current = captureNode

        // Mic level for VAD ring
        const analyser = captureCtx.createAnalyser()
        analyser.fftSize = 256
        const levelBuffer = new Uint8Array(analyser.frequencyBinCount)
        sourceNode.connect(analyser)
        sourceNode.connect(captureNode)

        captureNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
          if (isMutedRef.current) return
          // Convert ArrayBuffer → base64 for sendRealtimeInput
          const int16 = new Int16Array(event.data)
          const bytes = new Uint8Array(int16.buffer)
          let binary = ''
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i])
          }
          callbacksRef.current.onAudioChunk(btoa(binary))
        }

        // Poll mic level for VAD ring at 30fps
        const rafLoop = () => {
          if (!mountedRef.current) return
          analyser.getByteFrequencyData(levelBuffer)
          const avg = levelBuffer.reduce((sum, v) => sum + v, 0) / levelBuffer.length
          callbacksRef.current.onMicLevel(avg / 128) // normalize 0-1
          requestAnimationFrame(rafLoop)
        }
        requestAnimationFrame(rafLoop)

        // ── Playback context (24kHz output) ───────────────────────────
        // Use the pre-created context if provided — it was created synchronously
        // in the click handler so it's already 'running'. Creating a new one here
        // (inside a useEffect, after an await) would start it 'suspended'.
        const playbackCtx = preCreatedPlaybackCtx ?? new AudioContext({ sampleRate: 24000 })
        playbackCtxRef.current = playbackCtx
        audioLog('playback AudioContext in use', {
          source: preCreatedPlaybackCtx ? 'pre-created (click handler)' : 'newly created in setup() (FALLBACK)',
          state: playbackCtx.state,
          sampleRate: playbackCtx.sampleRate,
        })

        // Only resume if not already running (fallback path when no pre-created ctx)
        if (playbackCtx.state !== 'running') {
          audioWarn('playback ctx NOT running before addModule — calling resume()', { state: playbackCtx.state })
          await playbackCtx.resume().catch((err) => audioWarn('first resume() rejected', { err: String(err) }))
          audioLog('playback ctx after first resume', { state: playbackCtx.state })
        }

        await playbackCtx.audioWorklet.addModule('/worklets/playback-processor.js')
        audioLog('playback worklet module loaded', { state: playbackCtx.state })

        // Guard: cleanup may have closed the context while addModule awaited
        if (!mountedRef.current || playbackCtx.state === 'closed') return

        // addModule() is async (200–500ms). Re-check state in case the context
        // was re-suspended during the gap (only relevant for the fallback path).
        if (playbackCtx.state !== 'running') {
          audioWarn('playback ctx re-suspended after addModule — resuming', { state: playbackCtx.state })
          await playbackCtx.resume().catch((err) => audioWarn('post-addModule resume rejected', { err: String(err) }))
          audioLog('playback ctx after second resume', { state: playbackCtx.state })
        }

        const playbackNode = new AudioWorkletNode(playbackCtx, 'playback-processor')
        playbackNodeRef.current = playbackNode
        playbackNode.connect(playbackCtx.destination)
        audioLog('playback node connected to destination', {
          state: playbackCtx.state,
          bufferedChunks: pendingChunksRef.current.length,
        })

        // Keep-alive: maintain a silent source so Chrome never auto-suspends
        // the idle AudioContext while waiting for Gemini's first audio packet.
        // Without this, the worklet drains pendingChunks to a suspended (muted)
        // destination — the user hears nothing until mid-sentence.
        const keepAlive = playbackCtx.createConstantSource()
        const silenceGain = playbackCtx.createGain()
        silenceGain.gain.value = 0
        keepAlive.connect(silenceGain)
        silenceGain.connect(playbackCtx.destination)
        keepAlive.start()

        // Flush any audio chunks that arrived during pipeline initialization.
        // Re-check state before draining — resume() resolves as "request accepted",
        // not "audio flowing". If still suspended, force-resume before posting.
        const pending = pendingChunksRef.current.splice(0)
        if (pending.length > 0) {
          audioLog('draining buffered chunks', { count: pending.length, state: playbackCtx.state })
          if (playbackCtx.state !== 'running') {
            audioWarn('drain: ctx not running — resuming before drain', { state: playbackCtx.state })
            await playbackCtx.resume().catch((err) => audioWarn('drain resume rejected', { err: String(err) }))
            audioLog('drain: ctx after resume', { state: playbackCtx.state })
          }
          for (const chunk of pending) {
            decodeAndPost(chunk, playbackNode)
          }
          callbacksRef.current.onPlaybackStarted()
          audioLog('drain complete')
        } else {
          audioLog('no chunks to drain (none arrived during init)')
        }

        // ── Tab visibility change → resume AudioContext ────────────────
        const handleVisibility = () => {
          if (!document.hidden) {
            captureCtx.resume().catch(() => {})
            playbackCtx.resume().catch(() => {})
          }
        }
        document.addEventListener('visibilitychange', handleVisibility)

        // ── Watchdog: poll every 2s and resume if context fell to 'suspended'
        // Chrome can silently re-suspend an AudioContext when the page loses
        // user activation, when the OS audio session is interrupted, or on
        // certain tab-switching paths. Without this watchdog, audio simply
        // stops working with no error — the exact intermittent symptom we hit.
        const watchdog = setInterval(() => {
          if (!mountedRef.current) return
          if (playbackCtx.state === 'suspended') {
            audioWarn('watchdog: playback ctx is SUSPENDED — resuming', { state: playbackCtx.state })
            playbackCtx.resume()
              .then(() => audioLog('watchdog: playback resume resolved', { state: playbackCtx.state }))
              .catch((err) => audioWarn('watchdog: playback resume rejected', { err: String(err) }))
          }
          if (captureCtx.state === 'suspended') {
            captureCtx.resume().catch(() => {})
          }
        }, 2000)

        // Store cleanup reference on the ctx object
        ;(captureCtx as unknown as Record<string, unknown>)._visibilityCleanup = () => {
          document.removeEventListener('visibilitychange', handleVisibility)
          clearInterval(watchdog)
        }
      } catch (err) {
        const msg =
          err instanceof DOMException && err.name === 'NotAllowedError'
            ? 'Microphone access is required for the Q&A session. Please grant permission and try again.'
            : 'Failed to set up audio pipeline. Please check your microphone.'
        setMicError(msg)
        console.error('[useAudioPipeline]', err)
      }
    }

    setup()

    return () => {
      mountedRef.current = false

      // Cleanup visibility listener
      const ctx = captureCtxRef.current as (AudioContext & Record<string, unknown>) | null
      if (ctx?._visibilityCleanup) (ctx._visibilityCleanup as () => void)()

      pendingChunksRef.current = []
      streamRef.current?.getTracks().forEach((t) => t.stop())
      captureCtxRef.current?.close()
      playbackCtxRef.current?.close()
      streamRef.current      = null
      captureCtxRef.current  = null
      playbackCtxRef.current = null
      captureNodeRef.current  = null
      playbackNodeRef.current = null
    }
  // callbacks intentionally excluded — stored in callbacksRef to avoid
  // tearing down audio pipeline on every re-render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  return {
    micGranted,
    micError,
    enqueuePlaybackChunk,
    flushPlaybackQueue,
    setMuted,
  }
}
