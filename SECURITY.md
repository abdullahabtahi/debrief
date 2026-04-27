# Security Policy

## Reporting a Vulnerability

If you discover a security issue, please **do not open a public GitHub issue**. Instead, email the maintainer directly at the address in the repository's GitHub profile, or open a private security advisory via GitHub:

> Repository → Security → Advisories → New draft advisory

We aim to acknowledge reports within 72 hours.

## Supported Versions

This project was built for a hackathon and is provided as-is. Only the `main` branch receives security updates while the project is actively maintained.

## Security Posture

- **Secrets** never live in source. All sensitive values (`SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, etc.) are loaded from environment variables locally and from Google Secret Manager in production.
- **Database access** uses Supabase's `service_role` key on the server only. Row-Level Security policies restrict every table to `service_role`.
- **Storage uploads** go directly from the browser to Google Cloud Storage via short-lived V4 signed URLs. The server never proxies file bytes.
- **Internal task handlers** (`/api/tasks/*`) verify Cloud Tasks OIDC tokens by signature, audience, and an explicit service-account allowlist. Missing config rejects all requests (fail-closed).
- **Rate limits** apply per-IP on the high-cost endpoints (`/api/qa/token`, `/api/debrief`, `/api/coach`, `POST /api/sessions`) to prevent quota burn.
- **Pre-push hook** scans staged changes for common API-key shapes before any `git push`.
- **GCS bucket** has uniform IAM, public-access-prevention enforced, and a 30-day lifecycle delete on session artifacts.

## Out of Scope

This project intentionally has no end-user authentication — sessions are identified by a UUID held in `localStorage` plus a 6-character session code. This is documented in the architecture and is appropriate for a single-user pitch rehearsal tool. Do not deploy this code as-is for multi-tenant production use.
