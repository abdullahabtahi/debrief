'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSessionStore, SessionState } from '@/stores/sessionStore'
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
  const setSessionState    = useSessionStore((s) => s.setSessionState)

  const [onboardingStep, setOnboardingStep] = useState(0)
  const [showOnboarding, setShowOnboarding] = useState(false)

  // Sync session state from DB on every page mount.
  // This corrects any stale localStorage state (e.g. regression bugs, cross-tab drift).
  // setSessionState is forward-only so this can never accidentally regress state.
  useEffect(() => {
    fetch(`/api/sessions/${sessionId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.state) setSessionState(data.state as SessionState)
      })
      .catch(() => {/* non-critical — silently ignore network errors */})
  }, [sessionId, setSessionState])

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
