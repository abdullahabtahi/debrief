import { motion, useTransform, type MotionValue } from 'framer-motion'

/**
 * Animates purely via Framer Motion's MotionValue pipeline.
 * Zero React re-renders — reads the MotionValue directly in the compositor.
 */
export function BargeInRing({ level }: { level: MotionValue<number> }) {
  // useTransform creates derived MotionValues — no React involvement at runtime
  const scale   = useTransform(level, [0, 1], [1, 1.15])
  const opacity = useTransform(level, [0, 0.25, 1], [0, 0.2, 0.45])

  return (
    <motion.div
      className="absolute inset-0 z-0 rounded-2xl border-4 border-emerald-400 mix-blend-screen pointer-events-none"
      style={{ scale, opacity }}
    />
  )
}
