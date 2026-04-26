'use client'

import { useEffect, useRef, useState } from 'react'
import { useMotionValueEvent, type MotionValue } from 'framer-motion'
import { BargeInRing } from './BargeInRing'
import { PacingIndicator } from './PacingIndicator'

interface UserPiPProps {
  /** Shared MotionValue<number> 0-1 from useAudioPipeline — no second mic capture */
  micLevel: MotionValue<number>
  isJudgeSpeaking: boolean
  /**
   * Visual variant.
   * - `pip` (default, legacy): fixed 256x192 corner tile.
   * - `dominant`: fills parent container — used in Meet-style stage where founder is the
   *   dominant tile. Pacing/BargeIn behavior unchanged. **Single camera capture preserved.**
   */
  variant?: 'pip' | 'dominant'
}

export function UserPiP({ micLevel, isJudgeSpeaking, variant = 'pip' }: UserPiPProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [granted, setGranted] = useState<'pending' | 'granted' | 'denied'>('pending')

  // Pacing: drive logic from MotionValue change events (no rAF / no extra mic).
  // State updates are throttled to ≤10fps to keep React renders low.
  const [continuousSpeakingMs, setContinuousSpeakingMs] = useState(0)
  const isJudgeSpeakingRef = useRef(isJudgeSpeaking)
  const lastSpokenTimestampRef = useRef<number | null>(null)
  const accumulatedMsRef = useRef(0)
  const lastPrevTimeRef = useRef(performance.now())
  const lastStateUpdateRef = useRef(0) // ms since last setContinuousSpeakingMs call
  // Debounce: judge must hold floor for 1500ms before we forgive the timer
  const judgeSpeakingStartRef = useRef<number | null>(null)

  useEffect(() => {
    isJudgeSpeakingRef.current = isJudgeSpeaking
    if (!isJudgeSpeaking) {
      // Judge stopped speaking: reset the debounce window
      judgeSpeakingStartRef.current = null
    }
  }, [isJudgeSpeaking])

  // Subscribe to the shared MotionValue — fires at audio pipeline's sample rate
  useMotionValueEvent(micLevel, 'change', (level) => {
    const now = performance.now()
    const delta = now - lastPrevTimeRef.current
    lastPrevTimeRef.current = now

    if (isJudgeSpeakingRef.current) {
      // Start the debounce clock the moment judge starts speaking
      if (judgeSpeakingStartRef.current === null) {
        judgeSpeakingStartRef.current = now
      }
      // Only forgive the founder's rambling after 1.5 s of sustained judge speech
      if (now - judgeSpeakingStartRef.current > 1500) {
        if (accumulatedMsRef.current > 0) {
          accumulatedMsRef.current = 0
          lastSpokenTimestampRef.current = null
          setContinuousSpeakingMs(0)
        }
      }
      return
    }

    // Founder is speaking
    if (level > 0.05) {
      lastSpokenTimestampRef.current = now
      accumulatedMsRef.current += delta
    } else if (lastSpokenTimestampRef.current && now - lastSpokenTimestampRef.current > 3500) {
      accumulatedMsRef.current = 0
      lastSpokenTimestampRef.current = null
    }

    // Throttle React re-renders to ≤10fps (every 100ms)
    if (now - lastStateUpdateRef.current > 100) {
      lastStateUpdateRef.current = now
      setContinuousSpeakingMs(accumulatedMsRef.current)
    }
  })

  // Video-only capture — audio is handled by useAudioPipeline in the parent
  useEffect(() => {
    let stream: MediaStream | null = null
    const requestCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        if (videoRef.current) videoRef.current.srcObject = stream
        setGranted('granted')
      } catch (err) {
        console.error('Camera access denied', err)
        setGranted('denied')
      }
    }
    requestCamera()
    return () => { stream?.getTracks().forEach((t) => t.stop()) }
  }, [])

  const warningLevel = continuousSpeakingMs > 45000 ? 'red' : continuousSpeakingMs > 30000 ? 'amber' : 'none'
  const progress = Math.min(continuousSpeakingMs / 45000, 1)
  const isRambling = warningLevel === 'red'

  // Variant-specific container classes. Pacing/BargeIn/video are identical across variants.
  const containerClass =
    variant === 'dominant'
      ? 'relative w-full h-full bg-white rounded-[28px] overflow-hidden shadow-[0_24px_64px_-16px_rgba(0,0,0,0.18)] flex items-center justify-center border border-white ring-1 ring-slate-900/5'
      : 'relative w-64 h-48 bg-white rounded-[24px] overflow-hidden shadow-[0_16px_48px_-12px_rgba(0,0,0,0.15)] flex items-center justify-center border border-white shrink-0 ring-1 ring-slate-900/5'

  const fallbackInitialsSize = variant === 'dominant' ? 'w-24 h-24 text-3xl' : 'w-12 h-12 text-lg'
  const labelText = variant === 'dominant' ? 'You · Founder' : 'You'
  const labelClass =
    variant === 'dominant'
      ? 'absolute top-4 left-4 bg-white/80 shadow-md backdrop-blur-md rounded-full px-4 py-1.5 flex justify-between items-center gap-2 z-20 border border-black/5'
      : 'absolute bottom-3 left-3 bg-white/70 shadow-sm backdrop-blur-md rounded-full px-3 py-1 flex justify-between items-center gap-2 z-20 border border-black/5'
  const labelTextClass =
    variant === 'dominant'
      ? 'text-slate-800 text-xs font-semibold tracking-wide uppercase'
      : 'text-slate-800 text-[10px] font-semibold tracking-wide uppercase'

  return (
    <div className={containerClass}>
      {granted === 'granted' ? (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="w-full h-full object-cover scale-x-[-1]"
        />
      ) : (
        <div className="flex flex-col items-center gap-2">
          <div className={`${fallbackInitialsSize} rounded-full bg-slate-100 flex items-center justify-center font-semibold text-slate-400`}>
            F
          </div>
        </div>
      )}

      <BargeInRing level={micLevel} />

      {/* Pacing Indicator warning overlay */}
      <PacingIndicator warningLevel={warningLevel} progress={progress} />

      <div className={labelClass}>
        <span className={labelTextClass}>{labelText}</span>
        {isRambling && <span className="text-red-500 text-[10px] font-bold uppercase animate-pulse">Rambling</span>}
      </div>
    </div>
  )
}
