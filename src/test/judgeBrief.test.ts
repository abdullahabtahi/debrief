import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { getTrafficLight, isReadyForRoom } from '@/lib/judgeLogic'

// ── Unit tests: getTrafficLight ────────────────────────────────────────────

describe('getTrafficLight', () => {
  it('returns red for empty string', () => {
    expect(getTrafficLight('')).toBe('bg-red-500')
  })

  it('returns red for null', () => {
    expect(getTrafficLight(null)).toBe('bg-red-500')
  })

  it('returns red for undefined', () => {
    expect(getTrafficLight(undefined)).toBe('bg-red-500')
  })

  it('returns red for text containing MISSING', () => {
    expect(getTrafficLight('Data strategy is MISSING')).toBe('bg-red-500')
  })

  it('returns red for text containing UNVALIDATED', () => {
    expect(getTrafficLight('Market is UNVALIDATED')).toBe('bg-red-500')
  })

  it('returns red for text containing VULNERABLE', () => {
    expect(getTrafficLight('Moat is VULNERABLE to incumbents')).toBe('bg-red-500')
  })

  it('returns red for text containing UNADDRESSED', () => {
    expect(getTrafficLight('Risk is UNADDRESSED')).toBe('bg-red-500')
  })

  it('is case-insensitive for flag keywords', () => {
    expect(getTrafficLight('data strategy is missing')).toBe('bg-red-500')
    expect(getTrafficLight('moat is vulnerable')).toBe('bg-red-500')
  })

  it('returns amber for short but non-empty, non-flagged text', () => {
    expect(getTrafficLight('Proprietary data')).toBe('bg-amber-400') // 16 chars
  })

  it('returns green for substantive text with no flags', () => {
    expect(getTrafficLight('Proprietary audio dataset from 50k real pitch recordings')).toBe('bg-green-500')
  })

  it('returns green for text exactly 20 chars', () => {
    expect(getTrafficLight('12345678901234567890')).toBe('bg-green-500') // exactly 20
  })
})

// ── Unit tests: isReadyForRoom ─────────────────────────────────────────────

describe('isReadyForRoom', () => {
  it('returns true when all dimensions are green', () => {
    expect(
      isReadyForRoom([
        { label: 'Data Strategy', val: 'Proprietary dataset of 50k pitch recordings gives us a flywheel advantage' },
        { label: 'Competitive Moat', val: 'Network effect + proprietary training data that competitors cannot replicate' },
        { label: 'Market Validation', val: '200 paying beta users at $99/month in first 3 weeks of launch' },
        { label: 'Failure Modes', val: 'Dependency on Google Live API; mitigated by WebRTC fallback' },
      ])
    ).toBe(true)
  })

  it('returns false when any dimension is red', () => {
    expect(
      isReadyForRoom([
        { label: 'Data Strategy', val: 'MISSING — no data strategy provided' },
        { label: 'Competitive Moat', val: 'Strong proprietary dataset and network effects from day one' },
        { label: 'Market Validation', val: '200 paying beta users at $99/month confirmed after 3 weeks' },
        { label: 'Failure Modes', val: 'Dependency on third-party APIs mitigated by fallback strategies' },
      ])
    ).toBe(false)
  })

  it('returns false when all dimensions are red', () => {
    expect(
      isReadyForRoom([
        { label: 'Data Strategy', val: null },
        { label: 'Competitive Moat', val: '' },
        { label: 'Market Validation', val: 'UNVALIDATED' },
        { label: 'Failure Modes', val: undefined },
      ])
    ).toBe(false)
  })
})

// ── Integration test: judge page fetches via API, not Supabase directly ───

describe('JudgeBriefPage data loading', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('calls /api/brief with session_id — NOT the Supabase client directly', async () => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          project_brief: {
            status: 'ready',
            extracted_summary: {
              problem: 'Founders lack pitch coaching',
              solution: 'AI judge simulation',
              target_user: 'Early-stage founders',
              key_differentiator: 'Gemini Live adversarial judges',
              tech_stack_hint: 'Next.js, ADK',
              team_size_hint: '2',
              data_strategy: 'Proprietary pitch recording dataset enables model fine-tuning flywheel',
              competitive_moat: 'Network effect from session data; no competitor has real-time judge simulation',
              market_validation: '50 beta users, 4.8 avg rating, $99/mo conversion in week 1',
              failure_modes: 'Gemini Live API dependency — mitigated with WebRTC fallback',
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )

    // Dynamically import to avoid hoisting issues with vi.stubGlobal
    const { JudgeBriefLoader } = await import('@/lib/judgeDataLoader')
    const result = await JudgeBriefLoader('test-session-id-123')

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/brief?session_id=test-session-id-123')
    )
    expect(result).not.toBeNull()
    expect(result?.data_strategy).toContain('flywheel')
  })

  it('returns null and does not hang when API returns error', async () => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Not found' } }), {
        status: 404,
      })
    )

    const { JudgeBriefLoader } = await import('@/lib/judgeDataLoader')
    const result = await JudgeBriefLoader('bad-session-id')

    expect(result).toBeNull()
  })

  it('returns null and does not hang when fetch throws (network error)', async () => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockRejectedValue(new Error('Network error'))

    const { JudgeBriefLoader } = await import('@/lib/judgeDataLoader')
    const result = await JudgeBriefLoader('some-session-id')

    expect(result).toBeNull()
  })
})
