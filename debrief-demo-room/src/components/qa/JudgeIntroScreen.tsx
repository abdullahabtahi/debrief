'use client'

import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface JudgeIntroScreenProps {
  onReady: () => void // MUST be called from a user gesture
  /** Context fetch status — gates the CTA so system prompt is never empty */
  contextStatus: 'loading' | 'ready' | 'error'
  /** Bootstrap error message (e.g. transcript not ready) — shown above the CTA */
  initError?: string | null
}

const JUDGES = [
  {
    id: 'vc',
    name: 'Alex',
    title: 'VC Partner',
    subtitle: 'Andreessen — Series A+',
    initials: 'AX',
    color: '#f1f5f9',
    textColor: '#0f172a',
  },
  {
    id: 'domain_expert',
    name: 'Dr. Morgan',
    title: 'Domain Expert',
    subtitle: 'Technical Advisor',
    initials: 'DM',
    color: '#f8fafc',
    textColor: '#0f172a',
  },
  {
    id: 'user_advocate',
    name: 'Sam',
    title: 'User Advocate',
    subtitle: 'UX Research Lead',
    initials: 'SM',
    color: '#f4f4f5',
    textColor: '#0f172a',
  },
]

const STAGGER_DELAY = 0.45 // seconds between each tile

export function JudgeIntroScreen({ onReady, contextStatus, initError }: JudgeIntroScreenProps) {
  const hasTriggeredRef = useRef(false)

  const handleBeginClick = () => {
    if (hasTriggeredRef.current || contextStatus !== 'ready') return
    hasTriggeredRef.current = true
    // This MUST stay synchronous inside the click handler for AudioContext autoplay
    onReady()
  }

  return (
    <div className="w-full flex flex-col items-center justify-center py-16">
      <motion.div
        className="mb-12 text-center"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-2xl font-semibold text-[#111c2d] tracking-tight">
          Meet your panel
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Three judges. One shot. Prepare yourself.
        </p>
      </motion.div>

      <div className="flex gap-6 mb-16">
        {JUDGES.map((judge, i) => (
          <motion.div
            key={judge.id}
            className="bg-white rounded-3xl p-8 w-60 shadow-sm border border-gray-100 flex flex-col items-center gap-4"
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.5,
              delay: i * STAGGER_DELAY,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            {/* Judge avatar */}
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-slate-800 text-xl font-semibold shadow-sm border border-slate-100"
              style={{ backgroundColor: judge.color }}
            >
              {judge.initials}
            </div>

            <div className="text-center">
              <p className="font-semibold text-[#111c2d] text-lg">{judge.name}</p>
              <p className="text-sm font-medium text-gray-600 mt-0.5">{judge.title}</p>
              <p className="text-xs text-gray-400 mt-1">{judge.subtitle}</p>
            </div>

            {/* Readiness indicator */}
            <motion.div
              className="flex items-center gap-1.5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * STAGGER_DELAY + 0.4 }}
            >
              <motion.span
                className="w-2 h-2 rounded-full bg-emerald-400"
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ repeat: Infinity, duration: 2, delay: i * 0.3 }}
              />
              <span className="text-xs text-gray-400">Ready</span>
            </motion.div>
          </motion.div>
        ))}
      </div>

      {/* CTA — appears after last judge tile is visible */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: JUDGES.length * STAGGER_DELAY + 0.3, duration: 0.45 }}
        className="flex flex-col items-center gap-3"
      >
        <button
          onClick={handleBeginClick}
          disabled={contextStatus !== 'ready'}
          className="rounded-full bg-black text-white px-10 py-4 text-sm font-semibold hover:bg-gray-900 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {contextStatus === 'loading' ? 'Preparing your session…' : 'Begin Q\u0026A Session'}
        </button>

        <AnimatePresence mode="wait">
          {/* initError takes priority — shown after a failed connect attempt */}
          {initError ? (
            <motion.p
              key="init-error"
              className="text-xs text-red-500 text-center max-w-xs"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {initError}
            </motion.p>
          ) : contextStatus === 'loading' ? (
            <motion.p
              key="loading"
              className="text-xs text-gray-400"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              Loading brief &amp; transcript…
            </motion.p>
          ) : contextStatus === 'ready' ? (
            <motion.div
              key="ready"
              className="flex flex-col items-center gap-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <p className="text-xs text-gray-400">
                Your microphone will activate when you click
              </p>
              <p className="text-[11px] text-gray-400/80">
                Tip: wear headphones to keep judges out of your mic
              </p>
            </motion.div>
          ) : contextStatus === 'error' ? (
            <motion.p
              key="error"
              className="text-xs text-red-400"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              Could not load session context — judges will work from your pitch only
            </motion.p>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
