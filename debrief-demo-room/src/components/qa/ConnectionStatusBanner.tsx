'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { ConnectionStatus } from '@/hooks/useGeminiLive'

const STATUS_CONFIG: Record<
  ConnectionStatus,
  { label: string; className: string; dot?: boolean; showRetry?: boolean; autoDismissMs?: number }
> = {
  idle: {
    label: '',
    className: 'hidden',
  },
  connecting: {
    label: 'Connecting to judges...',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
    dot: true,
  },
  live: {
    label: 'Session live',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: true,
    autoDismissMs: 3000,
  },
  reconnecting: {
    label: 'Connection interrupted — reconnecting...',
    className: 'bg-orange-50 text-orange-700 border-orange-200',
    dot: true,
  },
  lost: {
    label: 'Connection lost',
    className: 'bg-red-50 text-red-700 border-red-200',
    showRetry: true,
  },
}

interface ConnectionStatusBannerProps {
  status: ConnectionStatus
  onRetry?: () => void
}

export function ConnectionStatusBanner({ status, onRetry }: ConnectionStatusBannerProps) {
  const cfg = STATUS_CONFIG[status]
  const [dismissed, setDismissed] = useState(false)

  // Reset dismissed state whenever status changes
  useEffect(() => {
    setDismissed(false)
    if (!cfg.autoDismissMs) return
    const t = setTimeout(() => setDismissed(true), cfg.autoDismissMs)
    return () => clearTimeout(t)
  }, [status, cfg.autoDismissMs])

  const visible = status !== 'idle' && !dismissed

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={status}
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 border rounded-full px-4 py-1.5 text-xs font-medium backdrop-blur-sm ${cfg.className}`}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {cfg.dot && (
            <motion.span
              className="w-1.5 h-1.5 rounded-full bg-current"
              animate={status === 'live' ? { opacity: [0.4, 1, 0.4] } : {}}
              transition={{ repeat: Infinity, duration: 1.4 }}
            />
          )}
          <span>{cfg.label}</span>
          {cfg.showRetry && onRetry && (
            <button
              onClick={onRetry}
              className="ml-1 underline font-semibold hover:opacity-75"
            >
              Try again
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
