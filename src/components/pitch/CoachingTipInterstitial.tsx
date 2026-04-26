'use client'

import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Lightbulb } from 'lucide-react'

interface CoachingTipInterstitialProps {
  tip:       string
  onEnter:   () => void
}

export function CoachingTipInterstitial({ tip, onEnter }: CoachingTipInterstitialProps) {
  const btnRef = useRef<HTMLButtonElement>(null)

  // Move focus into modal on mount; restore on unmount handled by browser
  useEffect(() => {
    btnRef.current?.focus()
  }, [])

  // Escape key closes the interstitial (navigates to QA — same as onEnter)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEnter()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onEnter])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="coaching-tip-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-6"
      onClick={(e) => { if (e.target === e.currentTarget) onEnter() }}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="w-full max-w-lg bg-white rounded-3xl p-10 shadow-2xl flex flex-col gap-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon */}
        <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center">
          <Lightbulb size={22} className="text-amber-500" />
        </div>

        {/* Header */}
        <div className="flex flex-col gap-2">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Before You Enter the Room</p>
          <h2 id="coaching-tip-title" className="text-2xl font-bold text-gray-900 leading-snug">Coach's Note</h2>
        </div>

        {/* Tip */}
        <p className="text-base text-gray-700 leading-relaxed border-l-4 border-amber-300 pl-5 italic">
          {tip}
        </p>

        {/* CTA */}
        <button
          ref={btnRef}
          type="button"
          onClick={onEnter}
          className="w-full py-4 rounded-full bg-black text-white font-semibold text-sm hover:bg-gray-800 transition-colors"
        >
          Enter the Room
        </button>
      </motion.div>
    </div>
  )
}
