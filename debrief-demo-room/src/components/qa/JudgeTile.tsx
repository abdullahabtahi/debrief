'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

interface JudgeConfig {
  id: 'vc' | 'domain_expert' | 'user_advocate'
  name: string
  title: string
  initials: string
  /** Avatar fill color (idle) */
  avatarBg: string
  /** Persona accent color (used for top border, ring, active glow) */
  accent: string
  /** Muted tint of accent for active card background wash */
  activeBg: string
  /** Tag label for the judge's expertise context */
  tag: string
}

export const JUDGE_CONFIG: JudgeConfig[] = [
  {
    id: 'vc',
    name: 'Alex',
    title: 'VC Partner',
    initials: 'AX',
    avatarBg: '#e8edf7',
    accent: '#4f6bcd',
    activeBg: 'rgba(79,107,205,0.10)',
    tag: 'Andreessen · Series A',
  },
  {
    id: 'domain_expert',
    name: 'Dr. Morgan',
    title: 'Domain Expert',
    initials: 'DM',
    avatarBg: '#ede8f5',
    accent: '#7c5cbf',
    activeBg: 'rgba(124,92,191,0.10)',
    tag: 'Technical Advisor',
  },
  {
    id: 'user_advocate',
    name: 'Sam',
    title: 'User Advocate',
    initials: 'SM',
    avatarBg: '#e8f3ed',
    accent: '#3a9e70',
    activeBg: 'rgba(58,158,112,0.10)',
    tag: 'UX Research Lead',
  },
]

interface JudgeTileProps {
  judgeId: 'vc' | 'domain_expert' | 'user_advocate'
  isActiveSpeaker: boolean
  currentSubtitle: string | null
  /**
   * Visual density.
   * - `default` (legacy): full-height tile with avatar 96px, persona tag chip, attack vector label.
   * - `compact`: side-rail tile (avatar 56px, name only). Title/tag move to HTML title tooltip.
   *   Dynamic attack-vector label still appears under name when active speaker.
   */
  compact?: boolean
}

export function JudgeTile({ judgeId, isActiveSpeaker, currentSubtitle, compact = false }: JudgeTileProps) {
  const judge = JUDGE_CONFIG.find((j) => j.id === judgeId)!
  // Stable per-fragment key — avoids keying on content which can repeat
  const subtitleKeyRef = useRef(0)
  const [subtitleKey, setSubtitleKey] = useState(0)

  // Dynamic attack vector title
  const [dynamicTitle, setDynamicTitle] = useState(judge.title)

  useEffect(() => {
    if (currentSubtitle && isActiveSpeaker) {
      subtitleKeyRef.current += 1
      setSubtitleKey(subtitleKeyRef.current)

      // Keyword matching
      const txt = currentSubtitle.toLowerCase()
      if (txt.includes('market') || txt.includes('competitor') || txt.includes('growth')) {
        setDynamicTitle('Probing Go-to-Market')
      } else if (txt.includes('user') || txt.includes('customer') || txt.includes('pain')) {
        setDynamicTitle('Probing User Need')
      } else if (txt.includes('tech') || txt.includes('build') || txt.includes('code') || txt.includes('data')) {
        setDynamicTitle('Probing Engineering')
      } else if (txt.includes('business') || txt.includes('revenue') || txt.includes('model') || txt.includes('money')) {
        setDynamicTitle('Probing Business Model')
      }
    } else {
      // Revert to title when finished
      setDynamicTitle(judge.title)
    }
  }, [currentSubtitle, isActiveSpeaker, judge.title])

  // ── Compact (side-rail) variant ──────────────────────────────────────
  // Vertical-centered layout for the Meet-style right rail.
  // Restored features vs old horizontal row: 80px avatar, persona tag chip,
  // full 7-bar waveform, card lift on active speaker.
  if (compact) {
    return (
      <motion.div
        className="relative w-full rounded-[24px] flex flex-col items-center justify-center overflow-hidden py-5 px-4"
        style={{
          borderTop: isActiveSpeaker ? `3px solid ${judge.accent}` : '1px solid rgba(0,0,0,0.06)',
          borderLeft: '1px solid rgba(0,0,0,0.06)',
          borderRight: '1px solid rgba(0,0,0,0.06)',
          borderBottom: '1px solid rgba(0,0,0,0.06)',
          background: isActiveSpeaker
            ? `linear-gradient(180deg, ${judge.activeBg} 0%, white 100%)`
            : 'white',
          boxShadow: isActiveSpeaker
            ? `0 20px 48px -10px ${judge.accent}55, 0 6px 16px -6px rgba(0,0,0,0.08)`
            : '0 4px 16px -6px rgba(0,0,0,0.07)',
        }}
        animate={{ scale: isActiveSpeaker ? 1.03 : 1, y: isActiveSpeaker ? -6 : 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      >
        {/* Ambient radial wash from top center on active */}
        <AnimatePresence>
          {isActiveSpeaker && (
            <motion.div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: `radial-gradient(ellipse at 50% 10%, ${judge.accent}22 0%, transparent 65%)`,
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
            />
          )}
        </AnimatePresence>

        {/* Avatar with pulsing ring */}
        <div className="relative z-10 mb-3">
          <motion.div
            className="w-20 h-20 rounded-full flex items-center justify-center text-xl font-semibold"
            style={{
              backgroundColor: isActiveSpeaker ? judge.accent : judge.avatarBg,
              color: isActiveSpeaker ? 'white' : '#1e293b',
              boxShadow: isActiveSpeaker ? `0 8px 22px ${judge.accent}40` : 'none',
            }}
            animate={{ scale: isActiveSpeaker ? 1.08 : 1 }}
            transition={{ type: 'spring', stiffness: 320, damping: 22 }}
          >
            {judge.initials}
          </motion.div>
          <AnimatePresence>
            {isActiveSpeaker && (
              <motion.div
                className="absolute -inset-[5px] rounded-full"
                style={{ border: `2px solid ${judge.accent}` }}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: [0.5, 1, 0.5], scale: [1, 1.06, 1] }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Identity block */}
        <div className="text-center z-10">
          <p className="font-semibold text-slate-900 text-[14px] leading-tight">{judge.name}</p>
          <p className={`text-xs font-medium mt-0.5 transition-colors ${
            isActiveSpeaker ? 'text-slate-600' : 'text-slate-400'
          }`}>
            {judge.title}
          </p>
          {/* Persona tag chip */}
          <div
            className="mt-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
            style={{ backgroundColor: `${judge.accent}12`, color: judge.accent }}
          >
            {judge.tag}
          </div>
        </div>

        {/* Dynamic attack vector label */}
        <div className="h-4 mt-1.5 z-10">
          <AnimatePresence mode="wait">
            {isActiveSpeaker && dynamicTitle !== judge.title && (
              <motion.span
                key={dynamicTitle}
                className="block text-[10px] font-bold uppercase tracking-widest text-center"
                style={{ color: judge.accent }}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -2 }}
                transition={{ duration: 0.2 }}
              >
                {dynamicTitle}
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* Sound wave bars — full 7-bar on active */}
        <div className="h-5 mt-2 z-10">
          <AnimatePresence>
            {isActiveSpeaker ? (
              <motion.div
                className="flex items-end gap-[3px] h-5"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {[0, 0.1, 0.2, 0.15, 0.05, 0.2, 0.1].map((delay, i) => (
                  <motion.div
                    key={i}
                    className="w-[3px] rounded-full"
                    style={{ backgroundColor: judge.accent }}
                    animate={{ scaleY: [0.3, 1, 0.4, 0.8, 0.3] }}
                    transition={{
                      repeat: Infinity,
                      duration: 0.9 + i * 0.05,
                      delay,
                      ease: 'easeInOut',
                    }}
                    initial={{ scaleY: 0.3, height: 16 }}
                  />
                ))}
              </motion.div>
            ) : (
              <motion.span
                key="idle-dot"
                className="block w-1.5 h-1.5 rounded-full mx-auto"
                style={{ backgroundColor: judge.accent }}
                animate={{ opacity: [0.2, 0.5, 0.2] }}
                transition={{ repeat: Infinity, duration: 3 }}
                initial={{ opacity: 0.2 }}
              />
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      className="relative flex-1 rounded-[28px] flex flex-col items-center justify-center overflow-hidden"
      style={{
        // Intentional height: enough space to be architectural without wasteful dead space
        minHeight: 340,
        maxHeight: 460,
        // Top accent border per judge persona — the single strongest visual differentiator
        borderTop: `3px solid ${isActiveSpeaker ? judge.accent : `${judge.accent}40`}`,
        borderLeft: '1px solid rgba(0,0,0,0.06)',
        borderRight: '1px solid rgba(0,0,0,0.06)',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
        background: isActiveSpeaker
          ? `linear-gradient(180deg, ${judge.activeBg} 0%, white 100%)`
          : 'white',
        boxShadow: isActiveSpeaker
          ? `0 32px 80px -12px ${judge.accent}55, 0 8px 24px -8px rgba(0,0,0,0.10)`
          : '0 4px 24px -8px rgba(0,0,0,0.08)',
      }}
      animate={{ 
        scale: isActiveSpeaker ? 1.04 : 1,
        y: isActiveSpeaker ? -10 : 0,
      }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
    >
      {/* Ambient background wash on active */}
      <AnimatePresence>
        {isActiveSpeaker && (
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(ellipse at 50% 20%, ${judge.accent}22 0%, transparent 65%)`,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          />
        )}
      </AnimatePresence>

      {/* Avatar block */}
      <div className="relative z-10 flex flex-col items-center gap-5 px-8">
        {/* Avatar circle with speaking ring */}
        <div className="relative">
          <motion.div
            className="w-24 h-24 rounded-full flex items-center justify-center text-2xl font-semibold shrink-0"
            style={{ 
              backgroundColor: isActiveSpeaker ? judge.accent : judge.avatarBg,
              color: isActiveSpeaker ? 'white' : '#1e293b',
              boxShadow: isActiveSpeaker ? `0 8px 24px ${judge.accent}40` : 'none',
            }}
            animate={{ scale: isActiveSpeaker ? 1.1 : 1 }}
            transition={{ type: 'spring', stiffness: 320, damping: 22 }}
          >
            {judge.initials}
          </motion.div>
          {/* Pulsing ring — only when active */}
          <AnimatePresence>
            {isActiveSpeaker && (
              <motion.div
                className="absolute -inset-[5px] rounded-full"
                style={{ border: `2px solid ${judge.accent}` }}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: [0.5, 1, 0.5], scale: [1, 1.06, 1] }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Identity block */}
        <div className="text-center">
          <p className="font-semibold text-slate-900 text-[15px] leading-tight">{judge.name}</p>
          <p className={`text-xs font-medium mt-1 transition-colors ${isActiveSpeaker ? 'text-slate-600' : 'text-slate-400'}`}>
            {judge.title}
          </p>
          {/* Persona tag — distinguishes role at a glance */}
          <div
            className="mt-3 inline-flex items-center rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wider"
            style={{
              backgroundColor: `${judge.accent}12`,
              color: judge.accent,
            }}
          >
            {judge.tag}
          </div>
        </div>

        {/* Dynamic attack vector label — appears when probing a topic */}
        <AnimatePresence mode="wait">
          {isActiveSpeaker && dynamicTitle !== judge.title && (
            <motion.div
              className="flex items-center gap-1.5"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25 }}
            >
              <span
                className="text-[10px] font-bold uppercase tracking-widest"
                style={{ color: judge.accent }}
              >
                {dynamicTitle}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sound wave bars — active speaking indicator */}
        <AnimatePresence>
          {isActiveSpeaker && (
            <motion.div
              className="flex items-end gap-[3px] h-5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {[0, 0.1, 0.2, 0.15, 0.05, 0.2, 0.1].map((delay, i) => (
                <motion.div
                  key={i}
                  className="w-[3px] rounded-full"
                  style={{ backgroundColor: judge.accent }}
                  animate={{ scaleY: [0.3, 1, 0.4, 0.8, 0.3] }}
                  transition={{
                    repeat: Infinity,
                    duration: 0.9 + i * 0.05,
                    delay,
                    ease: 'easeInOut',
                  }}
                  initial={{ scaleY: 0.3, height: 16 }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* "Thinking" idle state — very subtle pulsing dot when not speaking */}
      <AnimatePresence>
        {!isActiveSpeaker && (
          <motion.div
            className="absolute bottom-5 flex items-center gap-1.5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.35 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.5 }}
          >
            <motion.span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: judge.accent }}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ repeat: Infinity, duration: 3, delay: 0 }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
