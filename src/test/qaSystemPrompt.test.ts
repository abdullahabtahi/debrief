import { describe, it, expect } from 'vitest'
import { buildJudgeSystemPrompt } from '@/lib/qaSystemPrompt'

const FULL_CTX = {
  projectSummary: { name: 'DemoAI', market: 'B2B SaaS' },
  hackathonSummary: { theme: 'AI for founders', prize: '$10k' },
  transcript: 'We have 200 paying beta users at $99/month after 3 weeks.',
}

const EMPTY_CTX = {
  projectSummary: null,
  hackathonSummary: null,
  transcript: null,
}

// ── buildJudgeSystemPrompt: structure ─────────────────────────────────────

describe('buildJudgeSystemPrompt: required sections', () => {
  it('includes all three judge persona labels', () => {
    const p = buildJudgeSystemPrompt(FULL_CTX)
    expect(p).toContain('[VC]')
    expect(p).toContain('[DOMAIN_EXPERT]')
    expect(p).toContain('[USER_ADVOCATE]')
  })

  it('includes speaker-tag instruction', () => {
    const p = buildJudgeSystemPrompt(FULL_CTX)
    expect(p).toContain('SPEAKER TAGS')
  })

  it('includes YC vertebrae coverage mandate', () => {
    const p = buildJudgeSystemPrompt(FULL_CTX)
    expect(p).toContain('YC VERTEBRAE')
  })

  it('includes SESSION_ENDING closing ritual', () => {
    const p = buildJudgeSystemPrompt(FULL_CTX)
    expect(p).toContain('SESSION_ENDING')
    expect(p).toContain("Thank you. We'll deliberate.")
  })

  it('embeds the hackathon brief section', () => {
    const p = buildJudgeSystemPrompt(FULL_CTX)
    expect(p).toContain('=== HACKATHON BRIEF ===')
    expect(p).toContain('AI for founders')
  })

  it('embeds the project brief section', () => {
    const p = buildJudgeSystemPrompt(FULL_CTX)
    expect(p).toContain('=== PROJECT BRIEF ===')
    expect(p).toContain('DemoAI')
  })

  it('embeds the pitch transcript section', () => {
    const p = buildJudgeSystemPrompt(FULL_CTX)
    expect(p).toContain('=== PITCH TRANSCRIPT')
    expect(p).toContain('200 paying beta users')
  })
})

// ── buildJudgeSystemPrompt: BEGIN_SESSION kickoff ─────────────────────────

describe('buildJudgeSystemPrompt: BEGIN_SESSION kickoff', () => {
  it('instructs judges to wait for BEGIN_SESSION before speaking', () => {
    const p = buildJudgeSystemPrompt(FULL_CTX)
    expect(p).toContain('BEGIN_SESSION')
  })

  it('does NOT contain the old aggressive opening mandate', () => {
    const p = buildJudgeSystemPrompt(FULL_CTX)
    // Old wording that instructed an immediate challenge
    expect(p).not.toContain('OPENING QUESTION — MANDATORY')
    expect(p).not.toContain('cut directly to the hardest-to-defend assumption')
    expect(p).not.toContain('Begin the Q&A now with your opening question')
  })

  it('instructs a warm, natural opening (not an interrogation)', () => {
    const p = buildJudgeSystemPrompt(FULL_CTX)
    expect(p).toContain('natural')
    // Must NOT instruct a blunt challenge opener
    expect(p).not.toContain('challenge it immediately')
  })

  it('VC (Alex) is designated as the opener', () => {
    const p = buildJudgeSystemPrompt(FULL_CTX)
    // The opening section should reference the VC persona
    const openingIdx = p.indexOf('BEGIN_SESSION')
    const vcIdx = p.indexOf('Alex', openingIdx)
    expect(vcIdx).toBeGreaterThan(openingIdx)
  })

  it('closing line instructs judges to wait for BEGIN_SESSION, not begin immediately', () => {
    const p = buildJudgeSystemPrompt(FULL_CTX)
    expect(p).toContain('Wait for the BEGIN_SESSION message')
  })
})

// ── buildJudgeSystemPrompt: graceful fallbacks ────────────────────────────

describe('buildJudgeSystemPrompt: null context fallbacks', () => {
  it('renders without throwing when all context is null', () => {
    expect(() => buildJudgeSystemPrompt(EMPTY_CTX)).not.toThrow()
  })

  it('shows (not provided) placeholder for null project summary', () => {
    const p = buildJudgeSystemPrompt(EMPTY_CTX)
    expect(p).toContain('(not provided)')
  })

  it('shows transcript fallback message when transcript is null', () => {
    const p = buildJudgeSystemPrompt(EMPTY_CTX)
    expect(p).toContain('transcript not available')
  })

  it('still contains BEGIN_SESSION even with null context', () => {
    const p = buildJudgeSystemPrompt(EMPTY_CTX)
    expect(p).toContain('BEGIN_SESSION')
  })
})

// ── buildJudgeSystemPrompt: panel dynamics ────────────────────────────────

describe('buildJudgeSystemPrompt: panel dynamics', () => {
  it('instructs judges to interject if founder speaks too long', () => {
    const p = buildJudgeSystemPrompt(FULL_CTX)
    expect(p).toContain('90 seconds')
  })

  it('instructs judges to follow up if founder is silent 8+ seconds', () => {
    const p = buildJudgeSystemPrompt(FULL_CTX)
    expect(p).toContain('8+')
  })

  it('includes Toastmasters growth question guidance for closing', () => {
    const p = buildJudgeSystemPrompt(FULL_CTX)
    expect(p).toContain('Toastmasters')
  })
})
