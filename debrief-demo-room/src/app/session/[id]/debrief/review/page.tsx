'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useSessionStore } from '@/stores/sessionStore'
import { Lock } from 'lucide-react'
import { DebriefView } from '@/components/debrief/DebriefView'
import type { SessionState } from '@/stores/sessionStore'

const UNLOCKED_STATES: SessionState[] = ['qa_completed', 'debrief_ready', 'completed']

export default function DebriefReviewPage() {
  const { id } = useParams<{ id: string }>()
  const setActiveSubView = useSessionStore((s) => s.setActiveSubView)
  const setSessionState  = useSessionStore((s) => s.setSessionState)
  const sessionState     = useSessionStore((s) => s.sessionState)

  useEffect(() => {
    setActiveSubView('review')
  }, [setActiveSubView])

  // Sync Zustand from DB on mount — handles the case where the user navigated
  // directly or Zustand is stale after a page refresh.
  useEffect(() => {
    if (UNLOCKED_STATES.includes(sessionState)) return // already unlocked
    fetch(`/api/sessions/${id}`)
      .then((r) => r.json())
      .then((data) => {
        const dbState: SessionState = data?.state
        if (dbState && UNLOCKED_STATES.includes(dbState)) {
          setSessionState(dbState)
        }
      })
      .catch(() => {/* silently ignore — lock stays if fetch fails */})
  }, [id, sessionState, setSessionState])

  const isLocked = !UNLOCKED_STATES.includes(sessionState)

  if (isLocked) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center rounded-3xl bg-white p-8 text-center shadow-sm">
        <Lock className="mb-4 h-8 w-8 text-gray-300" />
        <h2 className="mb-2 text-xl font-semibold text-gray-900">Complete Q&amp;A First</h2>
        <p className="text-[15px] text-gray-500">
          Finish your Q&amp;A session before accessing the debrief.
        </p>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col pt-8">
      <DebriefView sessionId={id} />
    </div>
  )
}
