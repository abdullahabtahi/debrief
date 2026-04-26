import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ── Types ──────────────────────────────────────────────────────────────────

export type SessionState =
  | 'draft'
  | 'brief_ready'
  | 'pitch_recorded'
  | 'qa_completed'
  | 'debrief_ready'
  | 'completed'

export type Phase = 'brief' | 'room' | 'debrief'

export type SubView =
  | 'project'        // brief/project
  | 'hackathon'      // brief/hackathon
  | 'judge'          // brief/judge
  | 'pitch'          // room/pitch
  | 'qa'             // room/qa
  | 'review'         // debrief/review
  | 'coach'          // debrief/coach

export interface CTA {
  label: string
  action: 'navigate' | 'submit' | 'start_recording' | 'start_qa' | 'trigger_debrief' | 'none'
  target?: string
}

export interface RecentSession {
  id: string
  code: string
  state: SessionState
  title: string        // fallback "Untitled Session" until brief extraction sets it
  lastActiveAt: number // unix ms timestamp
}

// ── State ──────────────────────────────────────────────────────────────────

// Brief draft state — persisted so textarea content survives navigation
export interface BriefDraft {
  projectName: string
  projectContext: string
  hackathonContext: string
  pitchDeckGcs: string | null
  notesGcs: string | null
  pitchDeckFilename: string | null
  notesFilename: string | null
  hackathonGuidelinesUrl: string | null
}

interface SessionStore {
  // Persisted
  activeSessionId: string | null
  sessionCode: string | null
  sessionState: SessionState
  activeSessionTitle: string | null
  hasSeenOnboarding: boolean
  hasSeenCoachingTip: boolean
  activeSubView: SubView
  /** Per-session draft storage — keyed by session ID (source of truth) */
  briefDrafts: Record<string, BriefDraft>
  /** Active session's draft — always synced from briefDrafts on session switch */
  briefDraft: BriefDraft
  recentSessions: RecentSession[]
  isBriefExtracting: boolean

  // Actions
  setSession: (id: string, code: string) => void
  resumeSession: (id: string, code: string, state: SessionState, title?: string | null) => void
  setSessionState: (state: SessionState) => void
  setActiveSubView: (view: SubView) => void
  markOnboardingSeen: () => void
  markCoachingTipSeen: () => void
  resetCoachingTipSeen: () => void
  clearSession: () => void
  setBriefDraft: (draft: Partial<BriefDraft>) => void
  setActiveSessionTitle: (title: string) => void
  touchActiveSession: () => void
  removeRecentSession: (id: string) => void
  setIsBriefExtracting: (v: boolean) => void

  // Derived
  isPhaseUnlocked: (phase: Phase) => boolean
  currentCTA: () => CTA
}

// ── Constants ──────────────────────────────────────────────────────────────

const EMPTY_DRAFT: BriefDraft = {
  projectName: '',
  projectContext: '',
  hackathonContext: '',
  pitchDeckGcs: null,
  notesGcs: null,
  pitchDeckFilename: null,
  notesFilename: null,
  hackathonGuidelinesUrl: null,
}

// ── Store ──────────────────────────────────────────────────────────────────

const STATE_ORDER: SessionState[] = [
  'draft',
  'brief_ready',
  'pitch_recorded',
  'qa_completed',
  'debrief_ready',
  'completed',
]

function stateGte(a: SessionState, b: SessionState): boolean {
  return STATE_ORDER.indexOf(a) >= STATE_ORDER.indexOf(b)
}

export const useSessionStore = create<SessionStore>()(
  persist(
    (set, get) => ({
      activeSessionId: null,
      sessionCode: null,
      sessionState: 'draft',
      activeSessionTitle: null,
      hasSeenOnboarding: false,
      hasSeenCoachingTip: false,
      activeSubView: 'project',
      recentSessions: [],
      isBriefExtracting: false,
      briefDrafts: {},
      briefDraft: { ...EMPTY_DRAFT },

      // setSession — use only for brand-new sessions (always resets to draft)
      setSession: (id, code) => {
        const newEntry: RecentSession = {
          id,
          code,
          state: 'draft',
          title: 'Untitled Session',
          lastActiveAt: Date.now(),
        }
        set((s) => ({
          activeSessionId: id,
          sessionCode: code,
          sessionState: 'draft',
          activeSessionTitle: null,
          // Load this session's draft (or empty if new) and persist the slot
          briefDraft: s.briefDrafts[id] ?? { ...EMPTY_DRAFT },
          briefDrafts: s.briefDrafts[id]
            ? s.briefDrafts
            : { ...s.briefDrafts, [id]: { ...EMPTY_DRAFT } },
          recentSessions: [
            newEntry,
            ...s.recentSessions.filter((r) => r.id !== id),
          ].slice(0, 8),
        }))
      },

      // resumeSession — restores an existing session without resetting its state
      resumeSession: (id, code, state, title) =>
        set((s) => ({
          activeSessionId: id,
          sessionCode: code,
          sessionState: state,
          activeSessionTitle: title ?? s.recentSessions.find((r) => r.id === id)?.title ?? null,
          // Restore this session's draft — critical for isolation
          briefDraft: s.briefDrafts[id] ?? { ...EMPTY_DRAFT },
          briefDrafts: s.briefDrafts[id]
            ? s.briefDrafts
            : { ...s.briefDrafts, [id]: { ...EMPTY_DRAFT } },
          recentSessions: s.recentSessions.map((r) =>
            r.id === id ? { ...r, state, lastActiveAt: Date.now() } : r
          ),
        })),

      setSessionState: (state) =>
        set((s) => {
          // State machine is forward-only — never regress
          if (!stateGte(state, s.sessionState)) return {}
          return {
            sessionState: state,
            recentSessions: s.recentSessions.map((r) =>
              r.id === s.activeSessionId
                ? { ...r, state, lastActiveAt: Date.now() }
                : r
            ),
          }
        }),

      setActiveSubView: (view) =>
        set({ activeSubView: view }),

      markOnboardingSeen: () =>
        set({ hasSeenOnboarding: true }),

      markCoachingTipSeen: () =>
        set({ hasSeenCoachingTip: true }),

      resetCoachingTipSeen: () =>
        set({ hasSeenCoachingTip: false }),

      setBriefDraft: (draft) =>
        set((s) => {
          const id = s.activeSessionId
          if (!id) return {}
          const updated = { ...(s.briefDrafts[id] ?? s.briefDraft), ...draft }
          return {
            briefDraft: updated,
            briefDrafts: { ...s.briefDrafts, [id]: updated },
          }
        }),

      setIsBriefExtracting: (v) =>
        set({ isBriefExtracting: v }),

      clearSession: () =>
        set({
          activeSessionId: null,
          sessionCode: null,
          sessionState: 'draft',
          activeSessionTitle: null,
          hasSeenOnboarding: false,
          hasSeenCoachingTip: false,
          activeSubView: 'project',
          isBriefExtracting: false,
          // Keep briefDrafts intact so returning users recover their work
        }),

      setActiveSessionTitle: (title) =>
        set((s) => ({
          activeSessionTitle: title,
          recentSessions: s.recentSessions.map((r) =>
            r.id === s.activeSessionId ? { ...r, title } : r
          ),
        })),

      touchActiveSession: () =>
        set((s) => ({
          recentSessions: s.recentSessions.map((r) =>
            r.id === s.activeSessionId ? { ...r, lastActiveAt: Date.now() } : r
          ),
        })),

      removeRecentSession: (id) =>
        set((s) => ({
          recentSessions: s.recentSessions.filter((r) => r.id !== id),
        })),

      isPhaseUnlocked: (phase) => {
        const { sessionState } = get()
        switch (phase) {
          case 'brief':   return true
          case 'room':    return stateGte(sessionState, 'brief_ready')
          case 'debrief': return stateGte(sessionState, 'qa_completed')
        }
      },

      currentCTA: (): CTA => {
        const { sessionState, activeSubView } = get()

        if (sessionState === 'draft' && activeSubView === 'project') {
          return { label: 'Continue to Hackathon Context', action: 'navigate', target: 'hackathon' }
        }
        if (sessionState === 'draft' && activeSubView === 'hackathon') {
          return { label: 'Analyze Brief', action: 'submit' }
        }
        if (sessionState === 'brief_ready' && (activeSubView === 'project' || activeSubView === 'hackathon')) {
          return { label: 'Go to Room', action: 'navigate', target: 'pitch' }
        }
        if (sessionState === 'brief_ready' && activeSubView === 'pitch') {
          return { label: 'Record Pitch', action: 'start_recording' }
        }
        if (sessionState === 'pitch_recorded' && activeSubView === 'pitch') {
          return { label: 'Go to Q&A', action: 'navigate', target: 'qa' }
        }
        if (sessionState === 'pitch_recorded' && activeSubView === 'qa') {
          return { label: 'Start Q&A Session', action: 'start_qa' }
        }
        if (sessionState === 'qa_completed' && activeSubView === 'qa') {
          return { label: 'View Debrief', action: 'navigate', target: 'review' }
        }
        if (sessionState === 'qa_completed' && activeSubView === 'review') {
          return { label: 'Get Debrief', action: 'trigger_debrief' }
        }
        if (sessionState === 'debrief_ready' && activeSubView === 'review') {
          return { label: 'Talk to Coach', action: 'navigate', target: 'coach' }
        }
        if (sessionState === 'completed') {
          return { label: '', action: 'none' }
        }

        return { label: '', action: 'none' }
      },
    }),
    {
      name: 'demo-day-room-session',
      partialize: (state) => ({
        activeSessionId: state.activeSessionId,
        sessionCode: state.sessionCode,
        sessionState: state.sessionState,
        activeSessionTitle: state.activeSessionTitle,
        hasSeenOnboarding: state.hasSeenOnboarding,
        activeSubView: state.activeSubView,
        briefDraft: state.briefDraft,
        briefDrafts: state.briefDrafts,
        recentSessions: state.recentSessions,
        isBriefExtracting: state.isBriefExtracting,
        hasSeenCoachingTip: state.hasSeenCoachingTip,
      }),
    }
  )
)
