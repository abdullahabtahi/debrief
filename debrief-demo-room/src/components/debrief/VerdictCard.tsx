'use client'

import { motion } from 'framer-motion'

interface Props {
  verdict: string
}

export function VerdictCard({ verdict }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <div className="flex flex-col gap-1.5 mb-3">
        <h2 className="text-xl font-bold text-[#111c2d]">The Verdict</h2>
        <p className="text-xs text-[#4c4546] uppercase tracking-wide font-medium">
          Overall assessment
        </p>
      </div>
      <p className="text-sm leading-relaxed text-[#4c4546]">{verdict}</p>
    </motion.div>
  )
}
