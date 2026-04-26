'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const LOG_STEPS = [
  'Reading Q&A transcript…',
  'Analysing judge responses…',
  'Mapping fracture points…',
  'Scoring VC dimension…',
  'Scoring Domain Expert dimension…',
  'Scoring User Advocate dimension…',
  'Synthesising verdict…',
  'Writing coach drills…',
]

const JUDGES = [
  { abbr: 'VC', label: 'Venture Capital',  activatesAt: 3 },
  { abbr: 'DE', label: 'Domain Expert',    activatesAt: 4 },
  { abbr: 'UA', label: 'User Advocate',    activatesAt: 5 },
]

export function DebriefProgress() {
  const [currentStep, setCurrentStep] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const tickRef     = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setCurrentStep((s) => {
        if (s >= LOG_STEPS.length - 1) {
          clearInterval(intervalRef.current!)
          return s
        }
        return s + 1
      })
    }, 2200)

    tickRef.current = setInterval(() => setElapsed((s) => s + 1), 1000)

    return () => {
      clearInterval(intervalRef.current!)
      clearInterval(tickRef.current!)
    }
  }, [])

  return (
    <div className="flex flex-col gap-7 py-2">

      {/* Header pulse */}
      <div className="flex items-center gap-3">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-black opacity-40" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-black" />
        </span>
        <p className="text-[13px] font-semibold tracking-tight text-[#111c2d]">
          Analysing your session
        </p>
        <span className="ml-auto font-mono text-[11px] tabular-nums text-[#4c4546]">
          {elapsed}s
        </span>
      </div>

      {/* Log stream */}
      <div
        className="flex flex-col gap-1.5"
        role="log"
        aria-label="Debrief progress"
        aria-live="polite"
      >
        <AnimatePresence initial={false}>
          {LOG_STEPS.slice(0, currentStep + 1).map((step, i) => {
            const isActive = i === currentStep
            const isDone   = i < currentStep
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: isActive ? 1 : 0.32, y: 0 }}
                transition={{ duration: 0.28, ease: 'easeOut' }}
                className="flex items-center gap-2.5"
              >
                <span className={`w-3 text-[11px] font-mono shrink-0 ${
                  isActive ? 'text-black' : 'text-gray-300'
                }`}>
                  {isDone ? '✓' : isActive ? '▶' : '·'}
                </span>
                <span className={`text-[13px] font-mono leading-snug ${
                  isActive ? 'text-[#111c2d]' : 'text-gray-400'
                }`}>
                  {step}
                </span>
                {isActive && (
                  <span className="animate-pulse text-gray-400 text-[13px] font-mono">_</span>
                )}
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      {/* Judge tiles */}
      <div className="grid grid-cols-3 gap-3">
        {JUDGES.map((judge) => {
          const active = currentStep >= judge.activatesAt
          return (
            <motion.div
              key={judge.abbr}
              animate={{ opacity: active ? 1 : 0.38 }}
              transition={{ duration: 0.5 }}
              className={`flex flex-col gap-2 rounded-2xl border px-4 py-3.5 transition-colors ${
                active
                  ? 'border-[#dee8ff] bg-white shadow-sm'
                  : 'border-[#dee8ff] bg-[#f9f9ff]'
              }`}
            >
              <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black text-white ${
                active ? 'bg-black' : 'bg-gray-300'
              }`}>
                {judge.abbr[0]}
              </div>
              <div>
                <p className="text-[12px] font-semibold text-[#111c2d] leading-tight">
                  {judge.label}
                </p>
                <p className={`text-[11px] font-medium mt-0.5 ${
                  active ? 'text-emerald-600' : 'text-[#4c4546]'
                }`}>
                  {active ? '● Reviewing' : '○ Waiting'}
                </p>
              </div>
            </motion.div>
          )
        })}
      </div>

      <p className="text-center text-[12px] text-[#4c4546]">
        Usually 15–30 seconds. Your session is saved.
      </p>
    </div>
  )
}
