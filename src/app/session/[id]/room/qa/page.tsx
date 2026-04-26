'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useSessionStore } from '@/stores/sessionStore'
import { Lock } from 'lucide-react'
import { QARoom } from '@/components/qa/QARoom'

export default function QARoomPage() {
  const { id } = useParams<{ id: string }>()
  const setActiveSubView = useSessionStore((s) => s.setActiveSubView)
  const sessionState     = useSessionStore((s) => s.sessionState)

  useEffect(() => {
    setActiveSubView('qa')
  }, [setActiveSubView])

  const isLocked = !['pitch_recorded', 'qa_completed', 'debrief_ready', 'completed'].includes(
    sessionState,
  )

  if (isLocked) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center rounded-3xl bg-white p-8 text-center shadow-sm">
        <Lock className="mb-4 h-8 w-8 text-gray-300" />
        <h2 className="mb-2 text-xl font-semibold text-gray-900">Record Your Pitch First</h2>
        <p className="text-[15px] text-gray-500">
          Complete your pitch recording before entering the Q&amp;A room.
        </p>
      </div>
    )
  }

  return <QARoom sessionId={id} />
}
