'use client'

import { motion } from 'framer-motion'
import type { Finding } from '@/agents/debrief'

interface Props {
  type: 'strength' | 'weakness'
  findings: Finding[]
}

const SECTION_META = {
  strength: { title: 'Strengths', hint: 'What landed', icon: '✓', color: 'text-green-500', empty: 'No clear strengths identified.' },
  weakness: { title: 'Weaknesses', hint: 'What cracked', icon: '△', color: 'text-red-400', empty: 'No significant weaknesses flagged.' },
}

export function FindingsList({ type, findings }: Props) {
  const meta = SECTION_META[type]

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <div className="flex flex-col gap-1.5 mb-4">
        <h2 className="text-xl font-bold text-[#111c2d]">{meta.title}</h2>
        <p className="text-xs text-[#4c4546] uppercase tracking-wide font-medium">{meta.hint}</p>
      </div>
      {findings.length === 0 ? (
        <p className="text-sm text-[#4c4546] italic">{meta.empty}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {findings.map((f, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className={`mt-1 text-base ${meta.color}`}>{meta.icon}</span>
              <div>
                <p className="text-sm font-semibold text-[#111c2d]">{f.title}</p>
                <p className="text-sm text-[#4c4546] leading-relaxed mt-0.5">{f.explanation}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  )
}
