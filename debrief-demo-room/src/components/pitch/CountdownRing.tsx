'use client'

import { cn } from '@/lib/utils'

interface CountdownRingProps {
  totalSeconds:   number   // 180
  remainingSeconds: number
}

export function CountdownRing({ totalSeconds, remainingSeconds }: CountdownRingProps) {
  const radius      = 54
  const stroke      = 6
  const normalised  = radius - stroke / 2
  const circumference = 2 * Math.PI * normalised
  const progress    = remainingSeconds / totalSeconds
  const offset      = circumference * (1 - progress)

  const minutes = Math.floor(remainingSeconds / 60)
  const seconds = remainingSeconds % 60
  const label   = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`

  const ringColor =
    remainingSeconds <= 30 ? '#ef4444'   // red
    : remainingSeconds <= 60 ? '#f59e0b' // amber
    : '#22c55e'                          // green

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="120" height="120" className="-rotate-90">
        {/* Track */}
        <circle
          cx="60" cy="60" r={normalised}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={stroke}
        />
        {/* Progress */}
        <circle
          cx="60" cy="60" r={normalised}
          fill="none"
          stroke={ringColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.5s linear, stroke 0.5s ease' }}
        />
      </svg>
      <span
        className={cn(
          'absolute text-lg font-bold tabular-nums transition-colors',
          remainingSeconds <= 30 ? 'text-red-500'
          : remainingSeconds <= 60 ? 'text-amber-500'
          : 'text-gray-800'
        )}
      >
        {label}
      </span>
    </div>
  )
}
