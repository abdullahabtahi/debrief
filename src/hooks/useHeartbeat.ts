'use client'

import { useCallback, useRef } from 'react'

const HEARTBEAT_INTERVAL_MS = 30_000

// useHeartbeat
// Posts a heartbeat to /api/qa/heartbeat every 30 seconds.
// Called once the QA session is live.
export function useHeartbeat(sessionId: string, qaSessionId: () => string | null) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startHeartbeat = useCallback(() => {
    if (timerRef.current) return // already running

    timerRef.current = setInterval(async () => {
      const id = qaSessionId()
      if (!id) return
      try {
        await fetch('/api/qa/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ qa_session_id: id, session_id: sessionId }),
        })
      } catch (err) {
        // Non-fatal — heartbeat is best-effort
        console.warn('[useHeartbeat] Heartbeat failed:', err)
      }
    }, HEARTBEAT_INTERVAL_MS)
  }, [sessionId, qaSessionId])

  const stopHeartbeat = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  return { startHeartbeat, stopHeartbeat }
}
