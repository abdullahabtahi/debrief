'use client'

import { Loader2, CheckCircle, AlertCircle, Sparkles } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

type BannerState = 'processing' | 'ready' | 'failed'

interface TranscriptStatusBannerProps {
  state: BannerState
}

const CONFIG: Record<BannerState, { icon: React.ReactNode; label: string; sub?: string; classes: string }> = {
  processing: {
    icon:    <Loader2 size={15} className="animate-spin text-gray-500 shrink-0" />,
    label:   'Transcribing your pitch…',
    sub:     'This usually takes 20–40 seconds.',
    classes: 'bg-gray-50 border-gray-200 text-gray-600',
  },
  ready: {
    icon:    <Sparkles size={15} className="text-emerald-600 shrink-0" />,
    label:   'Transcript ready',
    sub:     'Scroll down to review your delivery metrics.',
    classes: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  },
  failed: {
    icon:    <AlertCircle size={15} className="text-red-500 shrink-0" />,
    label:   'Transcription failed',
    sub:     'Please re-record or re-upload your pitch.',
    classes: 'bg-red-50 border-red-200 text-red-600',
  },
}

export function TranscriptStatusBanner({ state }: TranscriptStatusBannerProps) {
  const { icon, label, sub, classes } = CONFIG[state]

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={state}
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 6 }}
        transition={{ duration: 0.22 }}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={cn('flex items-start gap-3 px-4 py-3.5 rounded-2xl border text-sm font-medium', classes)}
      >
        <span className="mt-0.5">{icon}</span>
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold">{label}</span>
          {sub && <span className="text-xs opacity-70 font-normal">{sub}</span>}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
