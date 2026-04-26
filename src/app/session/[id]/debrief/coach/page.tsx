'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSessionStore } from '@/stores/sessionStore'
import { Lock } from 'lucide-react'
import { CoachView } from '@/components/coach/CoachView'
import type { SessionState } from '@/stores/sessionStore'

const UNLOCKED_STATES: SessionState[] = ['debrief_ready', 'completed']

export default function DebriefCoachPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const setActiveSubView = useSessionStore((s) => s.setActiveSubView)
  const setSessionState = useSessionStore((s) => s.setSessionState)
  const sessionState = useSessionStore((s) => s.sessionState)

  useEffect(() => {
    setActiveSubView('coach')
  }, [setActiveSubView])

  // Sync Zustand from DB — handles stale state after page refresh
  useEffect(() => {
    if (UNLOCKED_STATES.includes(sessionState)) return
    fetch(`/api/sessions/${id}`)
      .then((r) => r.json())
      .then((data) => {
        const dbState: SessionState = data?.state
        if (dbState && UNLOCKED_STATES.includes(dbState)) {
          setSessionState(dbState)
        }
      })
      .catch(() => {/* silently ignore */})
  }, [id, sessionState, setSessionState])

  const isLocked = !UNLOCKED_STATES.includes(sessionState)

  if (isLocked) {
    return (
      <div className="w-full h-full flex flex-col pt-8">
        <div className="bg-white rounded-3xl p-10 shadow-sm border border-[#dee8ff] flex flex-col items-center gap-4 w-full">
          <Lock className="w-8 h-8 text-[#aabbcc]" />
          <p className="text-sm text-[#505f76] text-center leading-relaxed">
            Complete your debrief first to unlock the Coach.
          </p>
          <button
            onClick={() => router.push(`/session/${id}/debrief/review`)}
            className="text-sm font-medium text-[#111c2d] underline underline-offset-2 hover:text-black"
          >
            Go to Debrief →
          </button>
        </div>
      </div>
    )
  }

  return <CoachView sessionId={id} />
}
