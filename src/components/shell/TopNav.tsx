'use client'

import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useSessionStore, Phase } from '@/stores/sessionStore'
import { cn } from '@/lib/utils'
import { SessionCodeBadge } from './SessionCodeBadge'
import { CircleDot } from 'lucide-react'

const PHASES: { key: Phase; label: string; defaultSubView: string }[] = [
  { key: 'brief',   label: 'Brief',   defaultSubView: 'project' },
  { key: 'room',    label: 'Room',    defaultSubView: 'pitch' },
  { key: 'debrief', label: 'Debrief', defaultSubView: 'review' },
]

function activePhaseFromPath(path: string): Phase | null {
  if (path.includes('/room'))    return 'room'
  if (path.includes('/debrief')) return 'debrief'
  if (path.includes('/brief'))   return 'brief'
  return null
}

export function TopNav() {
  const router    = useRouter()
  const pathname  = usePathname()
  const sessionId      = useSessionStore((s) => s.activeSessionId)
  const isPhaseUnlocked = useSessionStore((s) => s.isPhaseUnlocked)
  const sessionTitle   = useSessionStore((s) => s.activeSessionTitle)
  const activePhase    = activePhaseFromPath(pathname)

  const handlePhaseClick = (phase: Phase, defaultSubView: string) => {
    if (!isPhaseUnlocked(phase) || !sessionId) return
    router.push(`/session/${sessionId}/${phase}/${defaultSubView}`)
  }

  let subTabs: { label: string; href: string; active: boolean }[] = []
  if (activePhase === 'brief' && sessionId) {
    subTabs = [
      { label: 'Project Context',  href: `/session/${sessionId}/brief/project`,   active: pathname.includes('project') },
      { label: 'Hackathon Context', href: `/session/${sessionId}/brief/hackathon`, active: pathname.includes('hackathon') },
    ]
  } else if (activePhase === 'room' && sessionId) {
    subTabs = [
      { label: 'Pitch',  href: `/session/${sessionId}/room/pitch`, active: pathname.includes('pitch') },
      { label: 'Q&A',    href: `/session/${sessionId}/room/qa`,    active: pathname.includes('qa')    },
    ]
  } else if (activePhase === 'debrief' && sessionId) {
    subTabs = [
      { label: 'Fracture Map', href: `/session/${sessionId}/debrief/review`, active: pathname.includes('review') },
      { label: 'Coach',        href: `/session/${sessionId}/debrief/coach`,  active: pathname.includes('coach')  },
    ]
  }

  return (
    <header className="header-gradient pt-8 pb-4 sticky top-0 z-50">
      <div className="flex flex-col w-full max-w-[1200px] mx-auto px-12 gap-8">

        {/* Top control bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Logo mark — click to return to home / sessions list */}
            <Link
              href="/"
              className="w-10 h-10 bg-white rounded-full shadow-sm flex items-center justify-center hover:bg-gray-50 transition-colors"
              title="Back to sessions"
            >
              <CircleDot size={20} strokeWidth={2.5} />
            </Link>

            {/* Session identity: project name or fallback */}
            <div className="bg-white rounded-full shadow-sm px-4 py-2 flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-slate-300 to-slate-200" />
              <span className="text-sm font-semibold text-gray-800 max-w-[160px] truncate">
                {sessionTitle ?? 'New Session'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {sessionId && <SessionCodeBadge />}
          </div>
        </div>

        {/* Phase tabs + sub-nav */}
        <div className="flex flex-col gap-6 mt-4">
          <div className="flex items-center gap-6 text-4xl font-bold tracking-tight">
            {PHASES.map(({ key, label, defaultSubView }) => {
              const unlocked = isPhaseUnlocked(key)
              const isActive = activePhase === key

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handlePhaseClick(key, defaultSubView)}
                  disabled={!unlocked}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'transition-colors text-left',
                    isActive
                      ? 'text-black'
                      : unlocked
                        ? 'text-gray-400 hover:text-gray-600'
                        : 'text-gray-400/50 cursor-not-allowed'
                  )}
                >
                  {label}
                </button>
              )
            })}
          </div>

          {subTabs.length > 0 && (
            <nav
              aria-label="Section navigation"
              className="flex justify-start items-center gap-8 border-b border-gray-200/50 pb-3"
            >
              {subTabs.map((tab) => (
                <button
                  key={tab.label}
                  type="button"
                  onClick={() => router.push(tab.href)}
                  aria-current={tab.active ? 'page' : undefined}
                  className={cn(
                    'text-sm font-semibold transition-colors pb-3 -mb-[14px]',
                    tab.active
                      ? 'text-black border-b-2 border-black'
                      : 'text-gray-500 hover:text-black border-b-2 border-transparent'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          )}
        </div>

      </div>
    </header>
  )
}
