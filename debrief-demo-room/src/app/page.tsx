'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Plus } from 'lucide-react'
import { useSessionStore, RecentSession, SessionState } from '@/stores/sessionStore'
import { CTAButton } from '@/components/shell/CTAButton'
import { MobileGuard } from '@/components/shell/MobileGuard'
import { RecentSessionCard } from '@/components/shell/RecentSessionCard'

export default function LandingPage() {
  const router = useRouter()

  const recentSessions      = useSessionStore((s) => s.recentSessions)
  const setSession           = useSessionStore((s) => s.setSession)
  const resumeSession        = useSessionStore((s) => s.resumeSession)
  const removeRecentSession  = useSessionStore((s) => s.removeRecentSession)

  const [recoveryCode, setRecoveryCode] = useState('')
  const [recoveryError, setRecoveryError] = useState('')
  const [creating, setCreating] = useState(false)
  const [recovering, setRecovering] = useState(false)
  const [showRecoveryInput, setShowRecoveryInput] = useState(false)

  const hasSessions = recentSessions.length > 0

  const handleCreateSession = async () => {
    setCreating(true)
    try {
      let res = await fetch('/api/sessions', { method: 'POST' })
      if (!res.ok) {
        await new Promise((r) => setTimeout(r, 1000))
        res = await fetch('/api/sessions', { method: 'POST' })
      }
      if (!res.ok) throw new Error('Failed')
      const { id, session_code } = await res.json()
      setSession(id, session_code)
      router.push(`/session/${id}/brief/project`)
    } catch {
      setCreating(false)
      alert('Could not start session. Refresh to try again.')
    }
  }

  // Route to the most relevant page for a session based on its current state
  const routeForState = (id: string, state: SessionState): string => {
    if (state === 'draft')          return `/session/${id}/brief/project`
    if (state === 'brief_ready')    return `/session/${id}/brief/project`
    if (state === 'pitch_recorded') return `/session/${id}/room/pitch`
    if (state === 'qa_completed')   return `/session/${id}/debrief/review`
    if (state === 'debrief_ready')  return `/session/${id}/debrief/review`
    if (state === 'completed')      return `/session/${id}/debrief/coach`
    return `/session/${id}/brief/project`
  }

  const handleContinueSession = (session: RecentSession) => {
    resumeSession(session.id, session.code, session.state, session.title)
    router.push(routeForState(session.id, session.state))
  }

  const handleRecover = async () => {
    const code = recoveryCode.trim().toUpperCase()
    setRecoveryError('')
    setRecovering(true)
    try {
      const res = await fetch(`/api/sessions/recover?code=${encodeURIComponent(code)}`)
      if (!res.ok) {
        setRecoveryError("That code didn't match anything. Double-check and try again.")
        return
      }
      const { id, session_code, state } = await res.json()
      resumeSession(id, session_code, state as SessionState)
      router.push(routeForState(id, state as SessionState))
    } catch {
      setRecoveryError("That code didn't match anything. Double-check and try again.")
    } finally {
      setRecovering(false)
    }
  }

  return (
    <>
      <MobileGuard />
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#f9f9ff]">
        <div
          className="pointer-events-none fixed inset-x-0 top-0 h-64"
          style={{ background: 'radial-gradient(circle at 50% 0%, rgba(135,165,230,0.8), transparent 50%)' }}
        />

        {hasSessions ? (
          /* ── Returning user: sessions list ─────────────────────── */
          <div className="relative z-10 w-full max-w-xl px-8 py-16">
            {/* Hero (compact) */}
            <div className="mb-10 text-center">
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-400">Demo Day Room</p>
              <h1 className="text-3xl font-bold tracking-tight text-[#111c2d]">
                Know exactly where your pitch will break.
              </h1>
            </div>

            {/* Sessions list */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Your sessions</span>
              </div>
              <div className="flex flex-col gap-2.5">
                {recentSessions.slice(0, 5).map((s) => (
                  <RecentSessionCard
                    key={s.id}
                    session={s}
                    onContinue={handleContinueSession}
                    onRemove={removeRecentSession}
                  />
                ))}
              </div>
            </div>

            {/* New session */}
            <button
              onClick={handleCreateSession}
              disabled={creating}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-300 py-4 text-sm font-semibold text-gray-500 transition-all hover:border-gray-400 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus size={15} />
              {creating ? 'Setting up your room…' : 'Start a new session'}
            </button>

            {/* Cross-device recovery */}
            <div className="mt-8 text-center">
              <button
                onClick={() => setShowRecoveryInput((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                Recovering from another device?
                <ChevronDown
                  size={13}
                  className={`transition-transform ${showRecoveryInput ? 'rotate-180' : ''}`}
                />
              </button>
              {showRecoveryInput && (
                <div className="mt-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={recoveryCode}
                      onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
                      placeholder="e.g. HS-NLLK"
                      maxLength={7}
                      className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 font-mono text-sm uppercase text-[#111c2d] outline-none focus:border-gray-400 placeholder:normal-case placeholder:font-sans placeholder:not-italic"
                    />
                    <button
                      onClick={handleRecover}
                      disabled={recovering || recoveryCode.length < 7}
                      className="rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-semibold text-[#111c2d] transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:text-gray-300"
                    >
                      {recovering ? 'Looking…' : 'Recover'}
                    </button>
                  </div>
                  {recoveryError && (
                    <p className="mt-2 text-xs text-red-500">{recoveryError}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ── First-time user: full hero ─────────────────────────── */
          <div className="relative z-10 w-full max-w-lg px-8 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">Demo Day Room</p>
            <h1 className="mb-4 text-4xl font-bold tracking-tight text-[#111c2d]">
              Know exactly where<br />your pitch will break.
            </h1>
            <p className="mb-10 text-[15px] leading-relaxed text-gray-500">
              Three AI judges. Adversarial Q&A. A fracture map of every weak point. Before Demo Day.
            </p>
            <CTAButton
              label={creating ? 'Setting up your room…' : 'Enter the Room'}
              onClick={handleCreateSession}
              disabled={creating}
              className="w-full"
            />

            {/* Cross-device recovery */}
            <div className="mt-10 text-center">
              <button
                onClick={() => setShowRecoveryInput((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                Have a session code?
                <ChevronDown
                  size={13}
                  className={`transition-transform ${showRecoveryInput ? 'rotate-180' : ''}`}
                />
              </button>
              {showRecoveryInput && (
                <div className="mt-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={recoveryCode}
                      onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
                      placeholder="e.g. HS-NLLK"
                      maxLength={7}
                      className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 font-mono text-sm uppercase text-[#111c2d] outline-none focus:border-gray-400 placeholder:normal-case placeholder:font-sans placeholder:not-italic"
                    />
                    <button
                      onClick={handleRecover}
                      disabled={recovering || recoveryCode.length < 7}
                      className="rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-semibold text-[#111c2d] transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:text-gray-300"
                    >
                      {recovering ? 'Looking…' : 'Continue'}
                    </button>
                  </div>
                  {recoveryError && (
                    <p className="mt-2 text-xs text-red-500">{recoveryError}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
