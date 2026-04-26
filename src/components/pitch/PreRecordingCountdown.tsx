'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

interface PreRecordingCountdownProps {
  onComplete: () => void
}

const STEPS = ['3', '2', '1', 'Go']

export function PreRecordingCountdown({ onComplete }: PreRecordingCountdownProps) {
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (step >= STEPS.length) {
      onComplete()
      return
    }
    const t = setTimeout(() => setStep((s) => s + 1), 1000)
    return () => clearTimeout(t)
  }, [step, onComplete])

  const label = STEPS[step] ?? ''
  const isGo  = label === 'Go'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <AnimatePresence mode="wait">
        <motion.div
          key={label}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 1.4, opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className={`text-9xl font-black select-none ${isGo ? 'text-green-400' : 'text-white'}`}
        >
          {label}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
