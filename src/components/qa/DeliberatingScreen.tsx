'use client'

import { useEffect } from 'react'
import { motion } from 'framer-motion'

interface DeliberatingScreenProps {
  /** Called after the cinematic sequence completes */
  onComplete: () => void
  /** Duration in ms before onComplete fires. Default 4500 */
  duration?: number
}

export function DeliberatingScreen({ onComplete, duration = 4500 }: DeliberatingScreenProps) {
  useEffect(() => {
    const timer = setTimeout(onComplete, duration)
    return () => clearTimeout(timer)
  }, [onComplete, duration])

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/80 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      {/* Three judge dots — deliberation indicator */}
      <motion.div
        className="flex gap-4 mb-12 shadow-sm rounded-full bg-white px-8 py-4 border border-slate-100"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
      >
        {['Alex', 'Dr. Morgan', 'Sam'].map((name, i) => (
          <div key={name} className="flex flex-col items-center gap-2">
            <motion.div
              className="w-12 h-12 rounded-full border border-slate-200"
              style={{ backgroundColor: ['#f1f5f9', '#f8fafc', '#f4f4f5'][i] }}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.4 + i * 0.15, duration: 0.4 }}
            />
            <motion.span
              className="text-xs text-slate-500 font-medium"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 + i * 0.15 }}
            >
              {name}
            </motion.span>
          </div>
        ))}
      </motion.div>

      {/* The punchline */}
      <motion.h1
        className="text-3xl font-semibold text-slate-900 text-center tracking-tight"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.0, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      >
        Thank you. We&rsquo;ll deliberate.
      </motion.h1>

      <motion.p
        className="mt-4 text-sm text-slate-500 font-medium text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.8, duration: 0.5 }}
      >
        Your Q&amp;A session is complete. Preparing your debrief&hellip;
      </motion.p>

      {/* Progress line */}
      <motion.div
        className="absolute bottom-0 left-0 h-1 bg-slate-300"
        initial={{ width: '0%' }}
        animate={{ width: '100%' }}
        transition={{ delay: 0.6, duration: duration / 1000 - 0.6, ease: 'linear' }}
      />
    </motion.div>
  )
}
