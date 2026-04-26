// OIDC verification for Cloud Tasks → Next.js handlers.
//
// Cloud Tasks signs each request with an ID token using the OIDC config
// supplied at task creation time (audience = target URL, email = SA).
// We verify:
//   1. Signature + issuer (handled by google-auth-library)
//   2. Audience matches our service URL (TASK_AUDIENCE env)
//   3. Email matches the allowlisted Cloud Tasks service account
//   4. email_verified === true
// Any failure → reject. Fail-closed by default.

import { OAuth2Client } from 'google-auth-library'

const client = new OAuth2Client()

function getAllowedSAs(): string[] {
  const csv = process.env.TASK_ALLOWED_SERVICE_ACCOUNTS ?? ''
  return csv.split(',').map((s) => s.trim()).filter(Boolean)
}

export interface OidcCheckResult {
  ok: boolean
  reason?: string
}

export async function verifyCloudTasksOidc(authHeader: string | null): Promise<OidcCheckResult> {
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, reason: 'missing bearer token' }
  }
  const token = authHeader.slice(7)

  const audience = process.env.TASK_AUDIENCE
  if (!audience) {
    return { ok: false, reason: 'TASK_AUDIENCE not configured' }
  }

  const allowed = getAllowedSAs()
  if (allowed.length === 0) {
    return { ok: false, reason: 'TASK_ALLOWED_SERVICE_ACCOUNTS not configured' }
  }

  try {
    const ticket = await client.verifyIdToken({ idToken: token, audience })
    const payload = ticket.getPayload()
    if (!payload) return { ok: false, reason: 'no payload' }
    if (payload.email_verified !== true) return { ok: false, reason: 'email not verified' }
    if (!payload.email || !allowed.includes(payload.email)) {
      return { ok: false, reason: `email ${payload.email} not allowlisted` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: `verify failed: ${(e as Error).message}` }
  }
}
