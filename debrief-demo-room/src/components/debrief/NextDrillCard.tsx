'use client'

import { motion } from 'framer-motion'

interface Props {
  nextDrill: string
}

export function NextDrillCard({ nextDrill }: Props) {
  return (
    <motion.div
      className="bg-black rounded-3xl p-8 flex flex-col gap-4"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          Next Drill
        </p>
        <h2 className="text-xl font-bold text-white">Your Priority Action</h2>
      </div>
      <p className="text-sm leading-relaxed text-gray-300">{nextDrill}</p>
    </motion.div>
  )
}
