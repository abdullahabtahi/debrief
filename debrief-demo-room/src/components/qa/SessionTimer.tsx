'use client'

import { useEffect, useRef, useState } from 'react'

interface SessionTimerProps {
  startedAt: number | null
  onSoftCap?: () => void  // fires at 8 min
  onHardCap?: () => void  // fires at 15 min — triggers auto-end
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function SessionTimer({ startedAt, onSoftCap, onHardCap }: SessionTimerProps) {
  const [elapsed, setElapsed] = useState(0)
  const softCapFiredRef = useRef(false)
  const hardCapFiredRef = useRef(false)
  // Stable callback refs — prevents dep array churn when callers pass inline functions
  const onSoftCapRef = useRef(onSoftCap)
  const onHardCapRef = useRef(onHardCap)
  useEffect(() => { onSoftCapRef.current = onSoftCap })
  useEffect(() => { onHardCapRef.current = onHardCap })

  useEffect(() => {
    if (!startedAt) return

    const tick = () => {
      const secs = Math.floor((Date.now() - startedAt) / 1000)
      setElapsed(secs)

      if (!softCapFiredRef.current && secs >= 480) {
        softCapFiredRef.current = true
        onSoftCapRef.current?.()
      }
      if (!hardCapFiredRef.current && secs >= 900) {
        hardCapFiredRef.current = true
        onHardCapRef.current?.()
      }
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  // callbacks deliberately excluded — stored in refs above to avoid interval restarts
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAt])

  const isWarning = elapsed >= 480
  const isDanger  = elapsed >= 720 // 12 min

  return (
    <span
      className={`font-mono text-lg font-semibold tabular-nums transition-colors tracking-widest ${
        isDanger ? 'text-red-500' : isWarning ? 'text-amber-500' : 'text-slate-700'
      }`}
    >
      {formatElapsed(elapsed)}
    </span>
  )
}

export { formatElapsed }
