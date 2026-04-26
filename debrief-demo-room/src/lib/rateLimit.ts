// Hackathon-grade in-memory rate limiter.
//
// Why this is "good enough" for a 1-week eval window:
//   - Cloud Run with min-instances=1 keeps mostly to one warm instance, so
//     in-memory state survives the burst window
//   - max-instances=10 means worst case a determined attacker gets 10×
//     the limit, still bounded
//   - No Redis dependency, no setup, no infra cost
//
// Trade-offs vs. real rate limiting:
//   - State is per-instance (multi-instance bypass possible)
//   - State is wiped on cold-start (rare with min-instances=1)
//   - No persistence across deploys (intentional — keeps it simple)

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

const PRUNE_INTERVAL_MS = 5 * 60 * 1000
let lastPrune = Date.now()

function prune(now: number) {
  if (now - lastPrune < PRUNE_INTERVAL_MS) return
  lastPrune = now
  for (const [key, b] of buckets) {
    if (b.resetAt < now) buckets.delete(key)
  }
}

export function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? 'unknown'
}

export interface RateLimitResult {
  ok: boolean
  retryAfterSec: number
}

/**
 * Fixed-window rate limit. Returns `ok: false` once the bucket exceeds `max`.
 * Key shape suggestion: `"<route>:<ip>"` to scope per-route.
 */
export function rateLimit(key: string, max: number, windowSec: number): RateLimitResult {
  const now = Date.now()
  prune(now)
  const windowMs = windowSec * 1000
  const existing = buckets.get(key)

  if (!existing || existing.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, retryAfterSec: 0 }
  }

  existing.count++
  if (existing.count > max) {
    return { ok: false, retryAfterSec: Math.ceil((existing.resetAt - now) / 1000) }
  }
  return { ok: true, retryAfterSec: 0 }
}

export function tooManyRequests(retryAfterSec: number): Response {
  return new Response(
    JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'Too many requests' } }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfterSec),
      },
    },
  )
}
