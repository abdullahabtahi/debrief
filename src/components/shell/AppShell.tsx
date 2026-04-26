'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSessionStore } from '@/stores/sessionStore'
import { TopNav } from './TopNav'
import { OnboardingModal } from './OnboardingModal'
import { InfoCircle } from './InfoCircle'
import { MobileGuard } from './MobileGuard'

interface Props {
  sessionId: string
  children: React.ReactNode
}

export function AppShell({ sessionId, children }: Props) {
  const router = useRouter()
  const hasSeenOnboarding  = useSessionStore((s) => s.hasSeenOnboarding)
  const markOnboardingSeen = useSessionStore((s) => s.markOnboardingSeen)
  const activeSessionId    = useSessionStore((s) => s.activeSessionId)

  const [onboardingStep, setOnboardingStep] = useState(0)
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => {
    // Show onboarding only for fresh sessions (not recovery)
    if (activeSessionId === sessionId && !hasSeenOnboarding) {
      setShowOnboarding(true)
    }
  }, [activeSessionId, sessionId, hasSeenOnboarding])

  const handleOnboardingNext = () => setOnboardingStep((s) => s + 1)

  const handleOnboardingFinish = () => {
    markOnboardingSeen()
    setShowOnboarding(false)
    setOnboardingStep(0)
  }

  return (
    <>
      <MobileGuard />
      <div className="flex flex-col min-h-screen relative z-10 w-full overflow-hidden">
        <TopNav />
        <main className="flex-1 max-w-[1200px] w-full mx-auto px-12 py-12 flex flex-col">{children}</main>
        <InfoCircle />
      </div>
      <OnboardingModal
        open={showOnboarding}
        currentStep={onboardingStep}
        onNext={handleOnboardingNext}
        onFinish={handleOnboardingFinish}
      />
    </>
  )
}
