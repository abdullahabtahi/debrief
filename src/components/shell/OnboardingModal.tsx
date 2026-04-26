'use client'

import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useSessionStore } from '@/stores/sessionStore'
import { CTAButton } from './CTAButton'

const STEPS = [
  {
    title: 'Not a pitch generator.',
    body: 'Demo Day Room is a pressure-testing system. You will prepare, perform, and be challenged. Just like the real room. The goal is to break before they do.',
    graphic: '⬛',
  },
  {
    title: 'Step 1: Set the brief.',
    body: 'Write what you built and what problem it solves. Paste a README, a Devpost draft, or write it raw. The judges read this cold before your pitch starts.',
    graphic: '⬛',
  },
  {
    title: 'Step 2: Record your pitch.',
    body: 'Three minutes. No do-overs mid-way. Record yourself pitching as if the judges are already in the room. Speak to your camera. Be specific.',
    graphic: '⬛',
  },
  {
    title: 'Step 3: Survive the Q&A.',
    body: 'A VC, a Domain Expert, and a User Advocate will question you in real time. Adversarially. They are not rooting for you. That is the point.',
    graphic: '⬛',
  },
  {
    title: 'Step 4: Read your fracture map.',
    body: 'After Q&A, you receive a ranked breakdown of every weak point in your pitch and one targeted drill to fix the most critical fracture before you present.',
    graphic: '⬛',
  },
]

interface Props {
  step: number
  onNext: () => void
  onFinish: () => void
}

function OnboardingStep({ step, onNext, onFinish }: Props) {
  const s = STEPS[step]
  const isLast = step === STEPS.length - 1

  return (
    <motion.div
      key={step}
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col items-center gap-6 text-center"
    >
      <div className="text-3xl font-bold text-black select-none w-10 h-10 bg-black rounded-full" />
      <div>
        <h2 className="mb-3 text-2xl font-bold tracking-tight text-[#111c2d]">{s.title}</h2>
        <p className="max-w-sm text-[15px] leading-relaxed text-gray-500">{s.body}</p>
      </div>

      {/* Step dots */}
      <div className="flex gap-1.5">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 w-1.5 rounded-full transition-colors ${i === step ? 'bg-black' : 'bg-gray-200'}`}
          />
        ))}
      </div>

      <CTAButton
        label={isLast ? 'Start My Session' : 'Next →'}
        onClick={isLast ? onFinish : onNext}
      />
    </motion.div>
  )
}

interface OnboardingModalProps {
  open: boolean
  currentStep: number
  onNext: () => void
  onFinish: () => void
}

export function OnboardingModal({ open, currentStep, onNext, onFinish }: OnboardingModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  // Trap focus inside modal + block Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') e.preventDefault()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      // Block click-outside dismissal
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        ref={overlayRef}
        className="relative w-full max-w-md rounded-3xl bg-white p-10 shadow-2xl"
        role="dialog"
        aria-modal="true"
      >
        <AnimatePresence mode="wait">
          <OnboardingStep
            key={currentStep}
            step={currentStep}
            onNext={onNext}
            onFinish={onFinish}
          />
        </AnimatePresence>
      </div>
    </div>
  )
}
