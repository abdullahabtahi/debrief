'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, AlertCircle, RotateCcw, Lock } from 'lucide-react'

import { useSessionStore } from '@/stores/sessionStore'
import { PitchInputSelector } from '@/components/pitch/PitchInputSelector'
import { PitchRecorder, type RecordingResult } from '@/components/pitch/PitchRecorder'
import { VideoUploadZone } from '@/components/pitch/VideoUploadZone'
import { PlaybackPreview } from '@/components/pitch/PlaybackPreview'
import { UploadProgressBar } from '@/components/pitch/UploadProgressBar'
import { TranscriptStatusBanner } from '@/components/pitch/TranscriptStatusBanner'
import { PitchSummaryCard } from '@/components/pitch/PitchSummaryCard'
import { CoachingTipInterstitial } from '@/components/pitch/CoachingTipInterstitial'

// ── Types ──────────────────────────────────────────────────────────────────

interface PitchStatusData {
  status: 'not_found' | 'pending' | 'uploading' | 'processing' | 'ready' | 'failed'
  transcript_preview?: string | null
  quality?: {
    word_count: number
    estimated_wpm?: number
    filler_word_pct: number
  } | null
  coaching_tip?: string | null
}

type InputMode   = 'record' | 'upload'
type UploadPhase = 'idle' | 'uploading' | 'done' | 'error'

// ── Page ───────────────────────────────────────────────────────────────────

export default function PitchPage() {
  const params    = useParams<{ id: string }>()
  const sessionId = params.id
  const router    = useRouter()

  const sessionState        = useSessionStore((s) => s.sessionState)
  const setSessionState     = useSessionStore((s) => s.setSessionState)
  const setActiveSubView    = useSessionStore((s) => s.setActiveSubView)
  const hasSeenCoachingTip  = useSessionStore((s) => s.hasSeenCoachingTip)
  const markCoachingTipSeen = useSessionStore((s) => s.markCoachingTipSeen)
  const resetCoachingTipSeen = useSessionStore((s) => s.resetCoachingTipSeen)

  const [mode, setMode]                     = useState<InputMode>('record')
  const [recording, setRecording]           = useState<RecordingResult | null>(null)
  const [recordError, setRecordError]       = useState<string | null>(null)
  const [uploadFile, setUploadFile]         = useState<File | null>(null)
  const [uploadDuration, setUploadDuration] = useState<number | null>(null)
  const [uploadPhase, setUploadPhase]       = useState<UploadPhase>('idle')
  const [uploadPercent, setUploadPercent]   = useState(0)
  const [pitchRecordingId, setPitchRecordingId] = useState<string | null>(null)
  const [showInterstitial, setShowInterstitial] = useState(false)

  const xhrRef = useRef<XMLHttpRequest | null>(null)

  // Sync sub-view
  useEffect(() => { setActiveSubView('pitch') }, [setActiveSubView])

  // Re-record is locked once QA has been completed
  const isReRecordLocked =
    sessionState === 'qa_completed' ||
    sessionState === 'debrief_ready' ||
    sessionState === 'completed'

  // ── Polling ────────────────────────────────────────────────────────────
  // TC-PITCH-07 fix: also enable when session is already pitch_recorded (return navigation).
  // The status endpoint queries by is_active=true so pitchRecordingId is not required.

  const { data: statusData } = useQuery<PitchStatusData>({
    queryKey: ['pitch-status', sessionId],
    queryFn:  async () => {
      const res = await fetch(`/api/pitch/status?session_id=${sessionId}`)
      if (!res.ok) throw new Error('status fetch failed')
      return res.json() as Promise<PitchStatusData>
    },
    enabled: !!sessionId && (
      !!pitchRecordingId ||
      ['pitch_recorded', 'qa_completed', 'debrief_ready', 'completed'].includes(sessionState)
    ),
    refetchInterval: (query) => {
      const s = query.state.data?.status
      if (!s || s === 'ready' || s === 'failed') return false
      return 5_000
    },
  })

  // Advance session state when transcript arrives
  useEffect(() => {
    if (statusData?.status === 'ready' && sessionState !== 'pitch_recorded') {
      setSessionState('pitch_recorded')
    }
  }, [statusData?.status, sessionState, setSessionState])

  // Show coaching tip interstitial once per session
  useEffect(() => {
    if (
      statusData?.status === 'ready' &&
      statusData.coaching_tip &&
      !hasSeenCoachingTip
    ) {
      setShowInterstitial(true)
    }
  }, [statusData?.status, statusData?.coaching_tip, hasSeenCoachingTip])

  // ── Upload ─────────────────────────────────────────────────────────────

  const uploadToGcs = useCallback(async (
    blob: Blob,
    mimeType: string,
    durationSeconds: number | null,
  ) => {
    setUploadPhase('uploading')
    setUploadPercent(0)

    try {
      const res = await fetch('/api/pitch/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, mime_type: mimeType, duration_seconds: durationSeconds }),
      })
      if (!res.ok) throw new Error('Failed to get upload URL')

      const { upload_url, gcs_path, pitch_recording_id, dev_mode } =
        await res.json() as { upload_url: string | null; gcs_path: string; pitch_recording_id: string; dev_mode?: boolean }

      void gcs_path
      setPitchRecordingId(pitch_recording_id)

      if (!dev_mode && upload_url) {
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          xhrRef.current = xhr

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) setUploadPercent(Math.round((e.loaded / e.total) * 100))
          }
          xhr.onload  = () => {
            if (xhr.status >= 200 && xhr.status < 300) { setUploadPercent(100); resolve() }
            else reject(new Error(`GCS upload failed: ${xhr.status}`))
          }
          xhr.onerror = () => reject(new Error('Network error during upload'))
          xhr.onabort = () => reject(new Error('Upload aborted'))

          xhr.open('PUT', upload_url)
          xhr.setRequestHeader('Content-Type', mimeType)
          xhr.send(blob)
        })
      } else {
        for (let p = 10; p <= 100; p += 10) {
          await new Promise<void>((r) => setTimeout(r, 80))
          setUploadPercent(p)
        }
      }

      const processRes = await fetch('/api/pitch/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, pitch_recording_id }),
      })
      if (!processRes.ok) throw new Error('Failed to start transcription')

      setUploadPhase('done')
    } catch {
      setUploadPhase('error')
    }
  }, [sessionId])

  // ── Event handlers ─────────────────────────────────────────────────────

  // TC-PITCH-02 fix: recording complete only stores the blob — upload requires explicit CTA.
  const handleRecordingComplete = useCallback((result: RecordingResult) => {
    if (result.blob.size === 0) {
      setRecordError('Recording produced no data. Please try again.')
      return
    }
    setRecordError(null)
    setRecording(result)
  }, [])

  // Explicit "Upload & Continue" for record mode
  const handleUploadRecording = useCallback(() => {
    if (!recording) return
    uploadToGcs(recording.blob, recording.mimeType, recording.durationSeconds)
  }, [recording, uploadToGcs])

  const handleReRecord = useCallback(() => {
    if (xhrRef.current && uploadPhase === 'uploading') {
      xhrRef.current.abort()
      xhrRef.current = null
    }
    setRecording(null)
    setRecordError(null)
    setUploadFile(null)
    setUploadDuration(null)
    setUploadPhase('idle')
    setUploadPercent(0)
    setPitchRecordingId(null)
    resetCoachingTipSeen()
    setShowInterstitial(false)
  }, [uploadPhase, resetCoachingTipSeen])

  const handleFileSelected = useCallback((file: File) => {
    setUploadFile(file)
  }, [])

  const handleUploadSubmit = useCallback(() => {
    if (!uploadFile) return
    uploadToGcs(uploadFile, uploadFile.type, uploadDuration)
  }, [uploadFile, uploadDuration, uploadToGcs])

  const handleEnterRoom = useCallback(() => {
    markCoachingTipSeen()
    setShowInterstitial(false)
    router.push(`/session/${sessionId}/room/qa`)
  }, [markCoachingTipSeen, router, sessionId])

  const handleGoToQA = useCallback(() => {
    router.push(`/session/${sessionId}/room/qa`)
  }, [router, sessionId])

  // ── Derived display state ───────────────────────────────────────────────

  const isUploading     = uploadPhase === 'uploading'
  const isDone          = uploadPhase === 'done'
  const isUploadError   = uploadPhase === 'error'
  const hasBlob         = !!recording
  const hasFile         = !!uploadFile
  const inputLocked     = isUploading || isDone

  // Record mode: waiting for explicit upload click (blob captured, not yet uploading)
  const canUploadRecording = hasBlob && uploadPhase === 'idle'
  const canSubmitUpload    = hasFile && uploadPhase === 'idle'

  const transcriptStatus = isDone || isUploading
    ? statusData?.status === 'ready'   ? 'ready'
    : statusData?.status === 'failed' || isUploadError ? 'failed'
    : 'processing'
    : null

  const pitchIsReady = statusData?.status === 'ready'

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <>
      <AnimatePresence>
        {showInterstitial && statusData?.coaching_tip && (
          <CoachingTipInterstitial
            tip={statusData.coaching_tip}
            onEnter={handleEnterRoom}
          />
        )}
      </AnimatePresence>

      <div className="flex flex-col gap-8 pb-12">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col gap-2"
        >
          <h1 className="text-3xl font-black text-[#111c2d] tracking-tight">Your Pitch</h1>
          <p className="text-sm text-gray-500">
            Record or upload your 3-minute demo day pitch. Aim for clarity and confidence.
          </p>
        </motion.div>

        {/* Mode selector */}
        <PitchInputSelector
          mode={mode}
          disabled={inputLocked}
          onChange={setMode}
        />

        {/* Main content card */}
        <motion.div
          layout
          className="w-full rounded-3xl border border-gray-100 bg-white p-8 shadow-sm flex flex-col gap-6"
        >
          <AnimatePresence mode="wait">
            {/* ── Record panel ── */}
            {mode === 'record' ? (
              <motion.div
                key="record-panel"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="flex flex-col gap-5"
              >
                {!hasBlob ? (
                  <PitchRecorder
                    onRecordingComplete={handleRecordingComplete}
                    onReRecord={handleReRecord}
                  />
                ) : (
                  <PlaybackPreview src={recording!.blob} />
                )}

                {/* 0-byte recording error */}
                {recordError && (
                  <p role="alert" className="text-sm text-red-600 font-medium text-center">{recordError}</p>
                )}

                {/* TC-PITCH-02: explicit upload CTA after recording */}
                {canUploadRecording && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3"
                  >
                    <button
                      type="button"
                      onClick={handleUploadRecording}
                      className="flex items-center gap-2 px-8 py-4 rounded-full bg-black text-white font-semibold text-sm hover:bg-gray-800 transition-colors shadow-lg shadow-black/10"
                    >
                      Upload &amp; Continue
                      <ArrowRight size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={handleReRecord}
                      className="flex items-center gap-2 px-5 py-4 rounded-full border border-gray-200 bg-white text-gray-600 font-medium text-sm hover:bg-gray-50 transition-all"
                    >
                      <RotateCcw size={14} />
                      Re-record
                    </button>
                  </motion.div>
                )}
              </motion.div>
            ) : (
              /* ── Upload panel ── */
              <motion.div
                key="upload-panel"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="flex flex-col gap-5"
              >
                {/* TC-PITCH-02b: show PlaybackPreview when file selected (before upload) */}
                {!hasFile ? (
                  <VideoUploadZone
                    file={uploadFile}
                    durationSeconds={uploadDuration}
                    onFileSelected={handleFileSelected}
                    onDurationLoaded={setUploadDuration}
                    onClear={handleReRecord}
                  />
                ) : uploadPhase === 'idle' ? (
                  <>
                    <PlaybackPreview src={uploadFile!} onDurationLoaded={setUploadDuration} />
                    {/* Compact file info row */}
                    <VideoUploadZone
                      file={uploadFile}
                      durationSeconds={uploadDuration}
                      onFileSelected={handleFileSelected}
                      onDurationLoaded={setUploadDuration}
                      onClear={handleReRecord}
                    />
                  </>
                ) : (
                  <PlaybackPreview src={uploadFile!} onDurationLoaded={setUploadDuration} />
                )}

                {canSubmitUpload && (
                  <motion.button
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    type="button"
                    onClick={handleUploadSubmit}
                    className="self-start flex items-center gap-2 px-8 py-4 rounded-full bg-black text-white font-semibold text-sm hover:bg-gray-800 transition-colors shadow-lg shadow-black/10"
                  >
                    Upload &amp; Continue
                    <ArrowRight size={15} />
                  </motion.button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Upload error */}
          <AnimatePresence>
            {isUploadError && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                role="alert"
                className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm"
              >
                <AlertCircle size={15} className="text-red-500 mt-0.5 shrink-0" />
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold text-red-700">Upload failed</span>
                  <span className="text-xs text-red-600 opacity-80">Check your connection, then try again.</span>
                </div>
                <button
                  type="button"
                  onClick={handleReRecord}
                  className="ml-auto text-xs font-semibold text-red-600 underline hover:no-underline shrink-0"
                >
                  Try again
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Upload progress */}
          <AnimatePresence>
            {isUploading && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <UploadProgressBar percent={uploadPercent} />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Transcript status banner */}
        <AnimatePresence>
          {transcriptStatus && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <TranscriptStatusBanner state={transcriptStatus} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Transcript summary card */}
        <AnimatePresence>
          {pitchIsReady && statusData?.transcript_preview && (
            <PitchSummaryCard
              transcriptPreview={statusData.transcript_preview}
              quality={statusData.quality ?? null}
            />
          )}
        </AnimatePresence>

        {/* Go to Q&A CTA */}
        <AnimatePresence>
          {pitchIsReady && !showInterstitial && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="flex items-center gap-4"
            >
              <button
                type="button"
                onClick={hasSeenCoachingTip || !statusData?.coaching_tip ? handleGoToQA : () => setShowInterstitial(true)}
                className="flex items-center gap-2.5 px-8 py-4 rounded-full bg-black text-white font-semibold text-sm hover:bg-gray-800 transition-colors shadow-lg shadow-black/10"
              >
                Go to Q&amp;A
                <ArrowRight size={15} />
              </button>
              {!hasSeenCoachingTip && statusData?.coaching_tip && (
                <p className="text-xs text-gray-400">
                  Your AI coach has a note for you before you go in.
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* TC-PITCH-06b + TC-PITCH-07: Re-record option when pitch is ready */}
        <AnimatePresence>
          {(pitchIsReady || (isDone && !pitchIsReady)) && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-gray-400 text-center"
            >
              {isReRecordLocked ? (
                <span className="inline-flex items-center gap-1.5">
                  <Lock size={11} />
                  Q&amp;A is complete — start a new session to re-record.
                </span>
              ) : (
                <>
                  Changed your mind?{' '}
                  <button
                    type="button"
                    onClick={handleReRecord}
                    className="underline hover:text-gray-600 transition-colors"
                  >
                    Re-record or re-upload
                  </button>
                </>
              )}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}
