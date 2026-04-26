'use client'

import { X, ArrowRight } from 'lucide-react'
import { RecentSession, SessionState } from '@/stores/sessionStore'

interface Props {
  session: RecentSession
  onContinue: (session: RecentSession) => void
  onRemove: (id: string) => void
}

const STATE_LABELS: Record<SessionState, { label: string; color: string }> = {
  draft:           { label: 'Brief in progress',    color: 'text-amber-600 bg-amber-50' },
  brief_ready:     { label: 'Brief complete',        color: 'text-blue-600 bg-blue-50' },
  pitch_recorded:  { label: 'Pitch recorded',        color: 'text-blue-600 bg-blue-50' },
  qa_completed:    { label: 'Q&A complete',          color: 'text-indigo-600 bg-indigo-50' },
  debrief_ready:   { label: 'Debrief ready',         color: 'text-green-700 bg-green-50' },
  completed:       { label: 'Session complete',      color: 'text-gray-600 bg-gray-100' },
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60_000)
  const hrs  = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)
  if (mins < 2)  return 'Just now'
  if (mins < 60) return `${mins}m ago`
  if (hrs < 24)  return `${hrs}h ago`
  if (days < 7)  return `${days}d ago`
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function RecentSessionCard({ session, onContinue, onRemove }: Props) {
  const { label, color } = STATE_LABELS[session.state]

  return (
    <div className="group flex items-center gap-4 rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm hover:border-gray-300 hover:shadow-md transition-all cursor-pointer"
      onClick={() => onContinue(session)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onContinue(session)}
    >
      {/* Session identity */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 text-[15px] truncate leading-snug">
          {session.title === 'Untitled Session' ? 'Untitled Project' : session.title}
        </p>
        <div className="flex items-center gap-3 mt-1.5">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>
            {label}
          </span>
          <span className="text-xs text-gray-400 font-mono">{session.code}</span>
          <span className="text-xs text-gray-400">{timeAgo(session.lastActiveAt)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(session.id) }}
          className="w-7 h-7 rounded-full flex items-center justify-center text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors opacity-0 group-hover:opacity-100"
          aria-label="Remove from history"
        >
          <X size={14} />
        </button>
        <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center text-white group-hover:scale-105 transition-transform">
          <ArrowRight size={15} />
        </div>
      </div>
    </div>
  )
}
