'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useDebriefQuery } from '@/hooks/useDebriefQuery'
import { DebriefTriggerCard } from './DebriefTriggerCard'
import { DebriefStreamingView } from './DebriefStreamingView'
import { DebriefProgress } from './DebriefProgress'
import { useQueryClient } from '@tanstack/react-query'
import type { DebriefOutput } from '@/agents/debrief'

interface Props {
  sessionId: string
}

const ABORT_TIMEOUT_MS = 90_000

// Apply a JSON Patch RFC 6902 "add" op to a Partial<DebriefOutput>
function applyStateDelta(
  current: Partial<DebriefOutput>,
  delta: Array<{ op: string; path: string; value: unknown }>,
): Partial<DebriefOutput> {
  const next = { ...current }
  for (const patch of delta) {
    if (patch.op === 'add' && patch.path.startsWith('/')) {
      const key = patch.path.slice(1) as keyof DebriefOutput
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(next as any)[key] = patch.value
    }
  }
  return next
}

export function DebriefView({ sessionId }: Props) {
  const queryClient = useQueryClient()
  const { data: existingDebrief, isLoading } = useDebriefQuery(sessionId)

  const [liveOutput, setLiveOutput] = useState<Partial<DebriefOutput>>({})
  const [streaming, setStreaming] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const [streamError, setStreamError] = useState<string | null>(null)
  const [questionCount, setQuestionCount] = useState(0)
  const [showPartial, setShowPartial] = useState(false)
  const [showRerunModal, setShowRerunModal] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // Fetch question count for trigger card copy
  useEffect(() => {
    fetch(`/api/sessions/${sessionId}`)
      .then((r) => r.json())
      .then((d) => { if (d?.qa_turn_count) setQuestionCount(d.qa_turn_count) })
      .catch(() => {})
  }, [sessionId])

  // Pre-warm on mount
  useEffect(() => {
    fetch('/api/debrief/warm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    }).catch(() => {})
  }, [sessionId])

  // Cleanup abort on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort() }
  }, [])

  const startStream = useCallback(async () => {
    setStreaming(true)
    setTimedOut(false)
    setStreamError(null)
    setLiveOutput({})

    const abort = new AbortController()
    abortRef.current = abort

    const timer = setTimeout(() => {
      abort.abort()
      setTimedOut(true)
      setStreaming(false)
      // Invalidate cache so existingDebrief picks up debrief_progress from DB
      queryClient.invalidateQueries({ queryKey: ['debrief', sessionId] })
    }, ABORT_TIMEOUT_MS)

    try {
      const res = await fetch('/api/debrief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
        signal: abort.signal,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        // 409 means a stream is already running (double-click) — silently ignore
        if (res.status === 409) {
          setStreaming(false)
          return
        }
        throw new Error(err?.error?.message ?? `Server error ${res.status}`)
      }

      if (!res.body) throw new Error('No stream body')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'STATE_DELTA' && Array.isArray(event.delta)) {
              setLiveOutput((prev) => applyStateDelta(prev, event.delta))
            }
            if (event.type === 'RUN_FINISHED') {
              clearTimeout(timer)
              setStreaming(false)
              queryClient.invalidateQueries({ queryKey: ['debrief', sessionId] })
              return
            }
          } catch {
            // malformed SSE line — skip
          }
        }
      }

      clearTimeout(timer)
      setStreaming(false)
      queryClient.invalidateQueries({ queryKey: ['debrief', sessionId] })
    } catch (err: unknown) {
      clearTimeout(timer)
      if ((err as Error)?.name !== 'AbortError') {
        setStreaming(false)
        setStreamError((err as Error)?.message ?? 'An unexpected error occurred')
        console.error('[DebriefView] stream error', err)
      }
    }
  }, [sessionId, queryClient])

  const handleRerun = useCallback(() => {
    setShowRerunModal(false)
    void startStream()
  }, [startStream])

  if (isLoading) return null

  const hasExisting = !!(existingDebrief?.output)
  const hasProgress = !!(existingDebrief?.output && Object.keys(existingDebrief.output).length > 0)
  const isInterrupted = hasExisting && existingDebrief?.status !== 'complete'

  // Resolve what to display
  const displayOutput: Partial<DebriefOutput> =
    streaming ? liveOutput : (existingDebrief?.output ?? {})

  // Show streaming view if actively streaming, existing debrief present, or user chose to show partial
  if (streaming || hasExisting || showPartial) {
    // While streaming but no sections have arrived yet, show the progress animation
    const hasLiveSections = Object.keys(liveOutput).length > 0
    const showProgress = streaming && !hasLiveSections

    return (
      <>
        {showRerunModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-3xl p-8 max-w-md w-full mx-4 flex flex-col gap-6 shadow-xl">
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Re-run Debrief?</h2>
                <p className="text-sm text-gray-500 leading-relaxed">
                  Your previous debrief and coach conversation will be archived. A new analysis will begin.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowRerunModal(false)}
                  className="flex-1 rounded-full border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 hover:border-gray-400 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRerun}
                  className="flex-1 rounded-full bg-black text-white px-5 py-2.5 text-sm font-medium hover:bg-gray-900 transition-colors"
                >
                  Re-run
                </button>
              </div>
            </div>
          </div>
        )}
        {showProgress ? (
          <div className="bg-white rounded-3xl px-8 py-8 shadow-[0_8px_48px_0_rgba(17,28,45,0.05)] border border-[#dee8ff]">
            <DebriefProgress />
          </div>
        ) : (
          <DebriefStreamingView
            sessionId={sessionId}
            output={displayOutput}
            isInterrupted={isInterrupted}
            onRerun={() => setShowRerunModal(true)}
          />
        )}
      </>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {timedOut && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3">
          <p className="text-sm font-semibold text-red-800">Debrief is taking too long.</p>
          <p className="text-xs text-red-600 mt-0.5">
            Your session may have been saved.{' '}
            {hasProgress && (
              <button className="underline" onClick={() => setShowPartial(true)}>
                Show partial results
              </button>
            )}
          </p>
        </div>
      )}
      <DebriefTriggerCard
        questionCount={questionCount}
        onStart={() => void startStream()}
        loading={streaming}
      />
      {streamError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3">
          <p className="text-sm font-semibold text-red-800">Debrief failed to start.</p>
          <p className="text-xs text-red-600 mt-0.5">{streamError}</p>
        </div>
      )}
    </div>
  )
}
