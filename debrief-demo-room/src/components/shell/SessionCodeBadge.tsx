'use client'

import { useState } from 'react'
import { useSessionStore } from '@/stores/sessionStore'
import { cn } from '@/lib/utils'

// SessionCodeBadge — shows session code. Click to copy.
export function SessionCodeBadge() {
  const sessionCode = useSessionStore((s) => s.sessionCode)
  const [copied, setCopied] = useState(false)

  if (!sessionCode) return null

  const handleCopy = async () => {
    await navigator.clipboard.writeText(sessionCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className={cn(
        'bg-white rounded-full shadow-sm px-4 py-2 flex items-center gap-3 transition-colors hover:bg-gray-50'
      )}
      title={`Session code: ${sessionCode} — click to copy`}
    >
      <span className="text-sm font-mono font-semibold text-gray-800 tracking-wide">
        {copied ? '✓ Copied' : sessionCode}
      </span>
      <div className="w-6 h-6 bg-black rounded-full flex items-center justify-center text-white shrink-0">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
      </div>
    </button>
  )
}
