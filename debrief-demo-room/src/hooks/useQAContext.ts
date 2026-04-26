'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface QAContextData {
  projectSummary: Record<string, unknown> | string | null
  hackathonSummary: Record<string, unknown> | string | null
  transcript: string | null
}

type Status = 'idle' | 'loading' | 'ready' | 'error'

// useQAContext
// Fetches the three context sources (project brief, hackathon brief, pitch transcript)
// needed to build the judge system prompt. Called before token issuance.
export function useQAContext(sessionId: string) {
  const [status, setStatus] = useState<Status>('idle')
  const [data, setData] = useState<QAContextData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const hasFetched = useRef(false)

  const fetch_ = useCallback(async () => {
    if (hasFetched.current) return
    // Mark in-flight immediately to prevent concurrent calls; reset on error so retry works
    hasFetched.current = true
    setStatus('loading')

    try {
      const res = await fetch(`/api/qa/context?session_id=${sessionId}`)
      if (!res.ok) throw new Error(`Context fetch failed: ${res.status}`)
      const json = await res.json() as {
        project_summary: Record<string, unknown> | null
        hackathon_summary: Record<string, unknown> | null
        transcript: string | null
      }

      setData({
        projectSummary: json.project_summary,
        hackathonSummary: json.hackathon_summary,
        transcript: json.transcript,
      })
      setStatus('ready')
    } catch (err) {
      console.error('[useQAContext]', err)
      setError(err instanceof Error ? err.message : 'Failed to load session context')
      setStatus('error')
      // Allow retry — reset gate so refetch() can re-enter
      hasFetched.current = false
    }
  }, [sessionId])

  useEffect(() => {
    fetch_()
  }, [fetch_])

  return { status, data, error, refetch: fetch_ }
}
