'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { scoreColor, ScoreLabelBadge } from './scoreUtils'

interface Props {
  persona: string
  score: number
  topConcern: string
  delay?: number
  /** Evidence quote from qa_vulnerabilities for this persona — shown on hover */
  tooltipEvidence?: string
}

export function FractureAxis({ persona, score, topConcern, delay = 0, tooltipEvidence }: Props) {
  const color = scoreColor(score)
  const isCritical = score <= 3
  const [showTooltip, setShowTooltip] = useState(false)

  return (
    <motion.div
      className="flex flex-col gap-2"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut', delay }}
    >
      <div className="flex items-center gap-3">
        <span className="w-32 shrink-0 text-xs font-semibold uppercase tracking-wide text-[#4c4546]">
          {persona}
        </span>
        <div
          className="relative flex-1"
          onMouseEnter={() => tooltipEvidence && setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden cursor-pointer">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: color }}
              initial={{ width: '0%' }}
              animate={isCritical
                ? { width: `${score * 10}%`, opacity: [1, 0.5, 1, 0.5, 1, 0.5, 1] }
                : { width: `${score * 10}%` }
              }
              transition={isCritical
                ? { duration: 0.8, ease: 'easeOut', delay, opacity: { delay: delay + 0.8, duration: 0.6, repeat: 2 } }
                : { duration: 0.8, ease: 'easeOut', delay }
              }
            />
          </div>
          {showTooltip && tooltipEvidence && (
            <div className="absolute left-0 top-5 z-50 w-72 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-lg">
              <blockquote className="border-l-2 border-gray-300 pl-3 text-xs italic text-gray-500 leading-relaxed">
                {tooltipEvidence}
              </blockquote>
            </div>
          )}
        </div>
        <span className="w-10 text-right text-sm font-bold text-[#111c2d]">
          {score}<span className="text-gray-300 font-medium">/10</span>
        </span>
      </div>
      <div className="flex items-center gap-2 pl-[8.5rem]">
        <ScoreLabelBadge score={score} />
        <span className="text-xs text-[#4c4546] leading-relaxed">{topConcern}</span>
      </div>
    </motion.div>
  )
}
