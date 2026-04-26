'use client'

import { motion } from 'framer-motion'

interface ActiveSpeakerRingProps {
  isActive: boolean
  color?: string
  size?: 'sm' | 'md' | 'lg'
}

const sizeMap = {
  sm: 'inset-[-4px]',
  md: 'inset-[-6px]',
  lg: 'inset-[-8px]',
}

export function ActiveSpeakerRing({
  isActive,
  color = '#3b82f6',
  size = 'md',
}: ActiveSpeakerRingProps) {
  if (!isActive) return null

  return (
    <motion.span
      className={`absolute ${sizeMap[size]} rounded-full pointer-events-none`}
      style={{ border: `3px solid ${color}` }}
      animate={{
        scale: [1, 1.08, 1],
        opacity: [0.6, 1, 0.6],
      }}
      transition={{
        repeat: Infinity,
        duration: 1.6,
        ease: 'easeInOut',
      }}
    />
  )
}
