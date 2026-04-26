import { describe, it, expect, beforeEach } from 'vitest'
import { useSessionStore } from '@/stores/sessionStore'

// Reset store to clean state before each test
beforeEach(() => {
  useSessionStore.setState({
    activeSessionId: null,
    sessionCode: null,
    sessionState: 'draft',
    activeSessionTitle: null,
    briefDrafts: {},
    briefDraft: {
      projectName: '',
      projectContext: '',
      hackathonContext: '',
      pitchDeckGcs: null,
      notesGcs: null,
      pitchDeckFilename: null,
      notesFilename: null,
      hackathonGuidelinesUrl: null,
    },
    recentSessions: [],
    isBriefExtracting: false,
    hasSeenOnboarding: false,
    hasSeenCoachingTip: false,
    activeSubView: 'project',
  })
})

describe('session isolation: briefDraft', () => {
  it('returns empty draft when no session is active', () => {
    const draft = useSessionStore.getState().briefDraft
    expect(draft.projectContext).toBe('')
    expect(draft.projectName).toBe('')
  })

  it('stores draft keyed to the active session', () => {
    useSessionStore.getState().setSession('session-A', 'AA-1111')
    useSessionStore.getState().setBriefDraft({ projectName: 'Defensor', projectContext: 'A '.repeat(30) })

    expect(useSessionStore.getState().briefDraft.projectName).toBe('Defensor')
  })

  it('switching sessions does NOT bleed draft from previous session', () => {
    // Set up session A with content
    useSessionStore.getState().setSession('session-A', 'AA-1111')
    useSessionStore.getState().setBriefDraft({ projectName: 'Defensor', projectContext: 'A '.repeat(30) })

    // Switch to session B
    useSessionStore.getState().setSession('session-B', 'BB-2222')

    const draft = useSessionStore.getState().briefDraft
    expect(draft.projectName).toBe('')
    expect(draft.projectContext).toBe('')
  })

  it('switching back to session A recovers its draft', () => {
    useSessionStore.getState().setSession('session-A', 'AA-1111')
    useSessionStore.getState().setBriefDraft({ projectName: 'Defensor', projectContext: 'A '.repeat(30) })

    useSessionStore.getState().setSession('session-B', 'BB-2222')
    useSessionStore.getState().setBriefDraft({ projectName: 'Product Decision Advisor', projectContext: 'B '.repeat(30) })

    // Switch back to A
    useSessionStore.getState().resumeSession('session-A', 'AA-1111', 'brief_ready')

    expect(useSessionStore.getState().briefDraft.projectName).toBe('Defensor')
  })

  it('writing to session B does not mutate session A draft', () => {
    useSessionStore.getState().setSession('session-A', 'AA-1111')
    useSessionStore.getState().setBriefDraft({ projectName: 'Defensor', projectContext: 'A '.repeat(30) })
    const draftA_before = useSessionStore.getState().briefDrafts['session-A']

    useSessionStore.getState().setSession('session-B', 'BB-2222')
    useSessionStore.getState().setBriefDraft({ projectName: 'Product Decision Advisor', projectContext: 'B '.repeat(30) })

    const draftA_after = useSessionStore.getState().briefDrafts['session-A']
    expect(draftA_after.projectName).toBe(draftA_before.projectName)
    expect(draftA_after.projectContext).toBe(draftA_before.projectContext)
  })

  it('setBriefDraft is a no-op when no session is active', () => {
    // Should not throw
    useSessionStore.getState().setBriefDraft({ projectName: 'Orphan' })
    expect(useSessionStore.getState().briefDraft.projectName).toBe('')
  })

  it('resumeSession creates an empty draft slot if none exists (backward compat)', () => {
    // Simulate old persisted state: briefDrafts is empty but we resume a session
    useSessionStore.getState().resumeSession('session-old', 'OO-9999', 'brief_ready')

    const draft = useSessionStore.getState().briefDraft
    expect(draft).toBeDefined()
    expect(draft.projectName).toBe('')
  })
})
