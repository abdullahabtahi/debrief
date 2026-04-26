// judgeDataLoader.ts
// Fetches judge brief data via the /api/brief route (server-side Supabase, service role).
// Client components MUST use this instead of calling Supabase directly.

export interface JudgeSummary {
  data_strategy:      string
  competitive_moat:   string
  market_validation:  string
  failure_modes:      string
  // base fields also available if needed
  problem?:           string
  solution?:          string
  target_user?:       string
  key_differentiator?: string
}

/**
 * Fetches the active project brief's extracted_summary for the given session.
 * Returns null if not available (not yet extracted, API error, or network failure).
 * Never throws — safe to call from client components.
 */
export async function JudgeBriefLoader(sessionId: string): Promise<JudgeSummary | null> {
  try {
    const res = await fetch(`/api/brief?session_id=${encodeURIComponent(sessionId)}`)
    if (!res.ok) return null

    const json = await res.json() as {
      project_brief?: {
        status?: string
        extracted_summary?: JudgeSummary | null
      } | null
    }

    const brief = json.project_brief
    if (!brief || brief.status !== 'ready' || !brief.extracted_summary) return null

    const s = brief.extracted_summary
    // Only return if the adversarial fields are present (new schema)
    if (!s.data_strategy && !s.competitive_moat && !s.market_validation && !s.failure_modes) {
      return null
    }

    return s
  } catch {
    return null
  }
}
