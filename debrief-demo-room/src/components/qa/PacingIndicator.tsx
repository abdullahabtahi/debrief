import { motion } from 'framer-motion'

export function PacingIndicator({ warningLevel, progress }: { warningLevel: 'none' | 'amber' | 'red', progress: number }) {
  if (warningLevel === 'none') return null
  
  const isRed = warningLevel === 'red'
  const strokeColor = isRed ? '#ef4444' : '#fbbf24' // red-500 or amber-400

  // SVG Circular progress
  const radius = 54
  const circumference = 2 * Math.PI * radius
  const offset = circumference - progress * circumference

  return (
    <div className="absolute top-3 right-3 w-10 h-10 pointer-events-none z-30 drop-shadow-md">
      <svg className="transform -rotate-90 w-10 h-10" viewBox="0 0 120 120">
        <circle
          className="text-white/40"
          strokeWidth="10"
          fill="transparent"
          stroke="currentColor"
          strokeLinecap="round"
          r={radius}
          cx="60"
          cy="60"
        />
        <motion.circle
          className={isRed ? 'animate-pulse' : ''}
          strokeWidth="10"
          fill="transparent"
          strokeLinecap="round"
          r={radius}
          cx="60"
          cy="60"
          stroke={strokeColor}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ ease: 'linear', duration: 0.1 }}
        />
      </svg>
    </div>
  )
}
