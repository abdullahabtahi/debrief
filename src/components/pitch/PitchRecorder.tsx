'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { VideoPreview } from './VideoPreview'
import { CountdownRing } from './CountdownRing'
import { RecordingControls } from './RecordingControls'
import { PreRecordingCountdown } from './PreRecordingCountdown'
import { motion, AnimatePresence } from 'framer-motion'

const MIME_PRIORITY = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
]

const MAX_SECONDS = 180 // 3 minutes

function selectMimeType(): string {
  for (const type of MIME_PRIORITY) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type
    }
  }
  return 'video/webm'
}

export interface RecordingResult {
  blob:            Blob
  mimeType:        string
  durationSeconds: number
}

interface PitchRecorderProps {
  onRecordingComplete: (result: RecordingResult) => void
  /** After re-record, wipe existing blob */
  onReRecord?: () => void
}

type Phase = 'idle' | 'countdown' | 'recording' | 'done'

export function PitchRecorder({ onRecordingComplete, onReRecord }: PitchRecorderProps) {
  const [phase, setPhase]       = useState<Phase>('idle')
  const [stream, setStream]     = useState<MediaStream | null>(null)
  const [elapsed, setElapsed]   = useState(0)
  const [remaining, setRemaining] = useState(MAX_SECONDS)
  const [cameraError, setCameraError] = useState<string | null>(null)

  const recorderRef  = useRef<MediaRecorder | null>(null)
  const chunksRef    = useRef<Blob[]>([])
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)

  // Acquire camera once on mount
  useEffect(() => {
    let active = true
    navigator.mediaDevices
      .getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true })
      .then((s) => { if (active) setStream(s) })
      .catch(() => {
        if (active) setCameraError('Camera access denied. Please allow camera & microphone access.')
      })

    return () => {
      active = false
    }
  }, [])

  // Release camera tracks on unmount
  useEffect(() => {
    return () => {
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [stream])

  const startRecording = useCallback(() => {
    if (!stream) return
    const mimeType = selectMimeType()
    const recorder = new MediaRecorder(stream, { mimeType })
    recorderRef.current = recorder
    chunksRef.current   = []

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      const durationSeconds = Math.round((Date.now() - startTimeRef.current) / 1000)
      const blob = new Blob(chunksRef.current, { type: mimeType })
      setPhase('done')
      onRecordingComplete({ blob, mimeType, durationSeconds })
    }

    startTimeRef.current = Date.now()
    recorder.start(250) // 250ms timeslice
    setElapsed(0)
    setRemaining(MAX_SECONDS)
    setPhase('recording')

    intervalRef.current = setInterval(() => {
      const secs = Math.round((Date.now() - startTimeRef.current) / 1000)
      setElapsed(secs)
      setRemaining(Math.max(0, MAX_SECONDS - secs))
      if (secs >= MAX_SECONDS) {
        recorderRef.current?.stop()
      }
    }, 500)
  }, [stream, onRecordingComplete])

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop()
  }, [])

  const handleReRecord = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setElapsed(0)
    setRemaining(MAX_SECONDS)
    setPhase('idle')
    onReRecord?.()
  }, [onReRecord])

  if (cameraError) {
    return (
      <div className="w-full aspect-video rounded-2xl bg-gray-900 flex flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-red-900/30 flex items-center justify-center">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <p className="text-red-400 text-sm font-medium">{cameraError}</p>
        <p className="text-gray-500 text-xs">Use the Upload tab to submit a pre-recorded pitch instead.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Countdown overlay */}
      {phase === 'countdown' && (
        <PreRecordingCountdown onComplete={startRecording} />
      )}

      {/* Camera preview */}
      <div className="relative">
        <VideoPreview stream={stream} />

        {/* Countdown ring overlay — only while recording */}
        <AnimatePresence>
          {phase === 'recording' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2 }}
              className="absolute top-4 right-4"
            >
              <CountdownRing totalSeconds={MAX_SECONDS} remainingSeconds={remaining} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center py-2">
        <RecordingControls
          state={phase === 'countdown' ? 'idle' : phase}
          recordingSeconds={elapsed}
          onStart={() => setPhase('countdown')}
          onStop={stopRecording}
          onReRecord={handleReRecord}
        />
      </div>

      {/* Safari warning */}
      {typeof navigator !== 'undefined' && /^((?!chrome|android).)*safari/i.test(navigator.userAgent) && (
        <p className="text-center text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2">
          Safari has limited recording support. For best results use Chrome or Firefox.
        </p>
      )}
    </div>
  )
}
