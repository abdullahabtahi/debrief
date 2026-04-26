'use client'

import { useMemo } from 'react'

interface SessionProgressBarProps {
  elapsedSeconds: number
  softCapSeconds?: number
  hardCapSeconds?: number
}

export function SessionProgressBar({
  elapsedSeconds,
  softCapSeconds = 480,
  hardCapSeconds = 900,
}: SessionProgressBarProps) {
  const fillPct = useMemo(
    () => Math.min((elapsedSeconds / hardCapSeconds) * 100, 100),
    [elapsedSeconds, hardCapSeconds],
  )
  const isPastSoftCap = elapsedSeconds >= softCapSeconds

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={hardCapSeconds}
      aria-valuenow={Math.min(elapsedSeconds, hardCapSeconds)}
      aria-label="Session progress"
      className="fixed top-0 left-0 right-0 h-[3px] bg-slate-200 z-50 overflow-hidden"
    >
      <div
        className="h-full origin-left transition-transform duration-1000 ease-linear"
        style={{
          transform: `scaleX(${fillPct / 100})`,
          backgroundColor: isPastSoftCap ? '#f59e0b' : '#22c55e',
        }}
      />
    </div>
  )
}
