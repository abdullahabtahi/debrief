'use client'

import { Loader2, CheckCircle, AlertCircle, RefreshCcw } from 'lucide-react'

export type BriefStatus = 'idle' | 'submitting' | 'analyzing' | 'ready' | 'failed'

interface BriefStatusBannerProps {
  status: BriefStatus
  onRetry?: () => void
}

export function BriefStatusBanner({ status, onRetry }: BriefStatusBannerProps) {
  // Always render a container to prevent layout shift (CLS).
  // When idle the container is invisible but still occupies space.
  const visible = status !== 'idle'

  const configs: Record<Exclude<BriefStatus, 'idle'>, {
    icon: React.ReactNode
    text: string
    className: string
  }> = {
    submitting: {
      icon: <Loader2 className="size-4 animate-spin shrink-0" />,
      text: 'Saving…',
      className: 'bg-gray-50 text-gray-600 border-gray-200',
    },
    analyzing: {
      icon: <Loader2 className="size-4 animate-spin shrink-0" />,
      text: 'Building your judge brief. This takes a few seconds.',
      className: 'bg-gray-50 text-gray-600 border-gray-200',
    },
    ready: {
      icon: <CheckCircle className="size-4 shrink-0 text-emerald-600" />,
      text: 'Your judges have been briefed.',
      className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    },
    failed: {
      icon: <AlertCircle className="size-4 shrink-0" />,
      text: 'Extraction hit an error. Your context is saved. Try again.',
      className: 'bg-red-50 text-red-700 border-red-200',
    },
  }

  return (
    // Outer wrapper always occupies space; inner fades in/out
    <div className="min-h-[44px]" role="status" aria-live="polite" aria-atomic="true">
      {visible && (
        <div
          className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition-all ${configs[status].className}`}
        >
          {configs[status].icon}
          <span>{configs[status].text}</span>
          {status === 'failed' && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="ml-auto flex items-center gap-1 text-xs underline hover:no-underline"
            >
              <RefreshCcw className="size-3" />
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  )
}
