'use client'

import { useRouter } from 'next/navigation'
import { useSessionStore, SubView } from '@/stores/sessionStore'
import { cn } from '@/lib/utils'

interface SubViewChip {
  key: SubView
  label: string
  phase: 'brief' | 'room' | 'debrief'
}

const BRIEF_CHIPS: SubViewChip[] = [
  { key: 'project',   label: 'Project',   phase: 'brief' },
  { key: 'hackathon', label: 'Hackathon', phase: 'brief' },
]

const ROOM_CHIPS: SubViewChip[] = [
  { key: 'pitch', label: 'Pitch',  phase: 'room' },
  { key: 'qa',    label: 'Q&A',    phase: 'room' },
]

const DEBRIEF_CHIPS: SubViewChip[] = [
  { key: 'review', label: 'Review', phase: 'debrief' },
  { key: 'coach',  label: 'Coach',  phase: 'debrief' },
]

type DotStatus = 'locked' | 'active' | 'done'

function dotClass(status: DotStatus) {
  return cn(
    'h-2 w-2 rounded-full',
    status === 'locked' && 'bg-gray-300',
    status === 'active' && 'bg-blue-500',
    status === 'done'   && 'bg-green-500',
  )
}

interface Props {
  phase: 'brief' | 'room' | 'debrief'
  sessionId: string
}

export function SubViewChips({ phase, sessionId }: Props) {
  const router = useRouter()
  const sessionState  = useSessionStore((s) => s.sessionState)
  const activeSubView = useSessionStore((s) => s.activeSubView)
  const setActiveSubView = useSessionStore((s) => s.setActiveSubView)

  const chips =
    phase === 'brief'   ? BRIEF_CHIPS :
    phase === 'room'    ? ROOM_CHIPS :
    DEBRIEF_CHIPS

  const isSubViewUnlocked = (sv: SubView): boolean => {
    switch (sv) {
      case 'project':   return true
      case 'hackathon': return true
      case 'pitch':     return ['brief_ready','pitch_recorded','qa_completed','debrief_ready','completed'].includes(sessionState)
      case 'qa':        return ['pitch_recorded','qa_completed','debrief_ready','completed'].includes(sessionState)
      case 'review':    return ['qa_completed','debrief_ready','completed'].includes(sessionState)
      case 'coach':     return ['debrief_ready','completed'].includes(sessionState)
    }
  }

  const getDotStatus = (sv: SubView): DotStatus => {
    if (!isSubViewUnlocked(sv)) return 'locked'
    if (sv === activeSubView)   return 'active'
    return 'done'
  }

  const handleClick = (sv: SubView) => {
    if (!isSubViewUnlocked(sv)) return
    setActiveSubView(sv)
    router.push(`/session/${sessionId}/${phase}/${sv}`)
  }

  return (
    <div className="flex items-center gap-2">
      {chips.map(({ key, label }) => {
        const unlocked = isSubViewUnlocked(key)
        const isActive = key === activeSubView
        const dotStatus = getDotStatus(key)

        return (
          <button
            key={key}
            onClick={() => handleClick(key)}
            disabled={!unlocked}
            className={cn(
              'flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium transition-colors',
              isActive
                ? 'bg-gray-100 text-[#111c2d]'
                : unlocked
                  ? 'text-gray-500 hover:bg-gray-50 hover:text-[#111c2d]'
                  : 'cursor-default text-gray-300',
            )}
          >
            <span className={dotClass(dotStatus)} />
            {label}
          </button>
        )
      })}
    </div>
  )
}
