'use client'

import { AnimatePresence, motion } from 'framer-motion'
import type { Speaker } from '@/hooks/useTurnCapture'

interface LiveCaptionsPanelProps {
  activeSpeaker: Speaker | null
  /** Current sentence fragment — resets at sentence boundaries (rolling window) */
  streamingText: string | null
  /** Completed sentences ordered oldest-first; show the last entry as history context */
  captionHistory: Array<{ id: string; speaker: Speaker; text: string }>
}

const SPEAKER_LABEL: Record<Speaker, string> = {
  founder:       'You',
  vc:            'Alex',
  domain_expert: 'Dr. Morgan',
  user_advocate: 'Sam',
}

// Matches persona accent colors from JUDGE_CONFIG in JudgeTile
const SPEAKER_ACCENT: Record<Speaker, string> = {
  founder:       '#64748b',
  vc:            '#4f6bcd',
  domain_expert: '#7c5cbf',
  user_advocate: '#3a9e70',
}

/**
 * Rolling 2-line caption strip — Google Meet / Teams pattern:
 * │ [faded]  SPEAKER  last completed sentence …
 * │ [live]   SPEAKER  current sentence fragment being spoken ▮
 *
 * No internal state: entirely driven by props.
 * Sentences rotate in/out with a slide-up transition.
 */
export function LiveCaptionsPanel({
  activeSpeaker,
  streamingText,
  captionHistory,
}: LiveCaptionsPanelProps) {
  // The most-recently completed sentence shown as context above the live line
  const historyEntry = captionHistory.at(-1) ?? null
  const hasLiveLine  = Boolean(activeSpeaker && streamingText)
  const hasContent   = historyEntry !== null || hasLiveLine

  if (!hasContent) {
    return (
      <div className="w-full flex items-center justify-center">
        <p className="text-xs text-slate-300 italic tracking-wide">Listening…</p>
      </div>
    )
  }

  const accent = activeSpeaker ? SPEAKER_ACCENT[activeSpeaker] : '#94a3b8'

  return (
    <div className="w-full flex flex-col gap-1">

      {/* ── History line — last completed sentence, faded for context ──────── */}
      <AnimatePresence mode="popLayout" initial={false}>
        {historyEntry && (
          <motion.div
            key={historyEntry.id}
            className="flex items-center gap-3"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 0.35, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            <span
              className="shrink-0 text-[9px] font-black uppercase tracking-widest w-20 text-right"
              style={{ color: SPEAKER_ACCENT[historyEntry.speaker], opacity: 0.55 }}
            >
              {SPEAKER_LABEL[historyEntry.speaker]}
            </span>
            <span className="text-sm text-slate-400 font-medium line-clamp-1 leading-snug">
              {historyEntry.text}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Live line — current sentence fragment with natural cursor ─────── */}
      <AnimatePresence>
        {hasLiveLine && (
          <motion.div
            key="live"
            className="flex items-center gap-3"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            {/* Speaker label — gentle pulse, not a competing animation */}
            <motion.span
              className="shrink-0 text-[9px] font-black uppercase tracking-widest w-20 text-right"
              style={{ color: accent }}
              animate={{ opacity: [0.65, 1, 0.65] }}
              transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
            >
              {SPEAKER_LABEL[activeSpeaker!]}
            </motion.span>

            {/* Sentence fragment — resets at boundaries, always one short line */}
            <span className="text-[15px] text-slate-900 font-semibold leading-snug flex-1 tracking-tight line-clamp-2">
              {streamingText}
              {/* Natural cursor: easeInOut fade, not a harsh mechanical flash */}
              <motion.span
                className="inline-block w-0.5 h-4 ml-0.5 align-middle rounded-full"
                style={{ backgroundColor: accent }}
                animate={{ opacity: [1, 0, 1] }}
                transition={{ repeat: Infinity, duration: 0.8, ease: 'easeInOut' }}
              />
            </span>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  )
}
