'use client'

import { motion, type Transition } from 'framer-motion'

const DOT_VARIANTS = {
  initial: { y: 0 },
  animate: { y: -6 },
}

const TRANSITION_BASE: Transition = {
  duration: 0.4,
  repeat: Infinity,
  repeatType: 'reverse',
  ease: 'easeInOut',
}

export function CoachTypingIndicator() {
  return (
    <div className="flex flex-col gap-2 max-w-[70%]">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-[#8899aa]">
        Coach
      </span>
      <div className="bg-[#f0f3ff] rounded-2xl rounded-tl-sm px-5 py-4 inline-flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="block w-2 h-2 rounded-full bg-[#8899bb]"
            variants={DOT_VARIANTS}
            initial="initial"
            animate="animate"
            transition={{ ...TRANSITION_BASE, delay: i * 0.14 }}
          />
        ))}
      </div>
    </div>
  )
}
