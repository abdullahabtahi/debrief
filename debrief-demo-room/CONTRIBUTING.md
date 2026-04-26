# Contributing

Thanks for taking the time to look at this project.

## Ground Rules

- **Spec before code.** Every feature has a plan in [`spec/features/<feature>/feature-plan.md`](spec/). Read it first.
- **No secrets in commits.** A pre-push hook (`scripts/pre-push-secret-scan.sh`) blocks accidental leaks. Bypass only with `git push --no-verify` and only when you know it's a false positive.
- **Conventional commits.** `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`.
- **Type-check before pushing.** `NODE_OPTIONS=--max-old-space-size=2048 npm run build` is the source of truth.

## Local Setup

```bash
# 1. Install
npm install

# 2. Copy env template and fill in values
cp .env.example .env.local
# edit .env.local — see comments inline

# 3. Authenticate to Google Cloud (for Vertex AI access)
gcloud auth application-default login

# 4. Run dev server (heap cap is required — Turbopack + GCP packages exceed 1 GB)
NODE_OPTIONS=--max-old-space-size=1536 npm run dev
```

Kill the dev server immediately after smoke tests — leaving it running while editing code OOMs the laptop.

## Project Layout

```
src/
  app/           Next.js App Router pages + API routes
  agents/        ADK agent definitions (debrief, coach)
  components/    UI components, co-located by feature
  hooks/         React hooks
  lib/           Shared utilities (Supabase, GCS, OIDC verifier, rate limiter)
  stores/        Zustand stores
spec/            Feature specs (read before changing related code)
scripts/         Deployment + maintenance scripts
migrations/      Supabase SQL migrations
```

## Pull Requests

1. Branch from `main`.
2. Keep changes focused — one concern per PR.
3. Run `npm run build` locally before pushing.
4. Describe what changed, why, and how you tested it.

## Reporting Bugs / Security Issues

- Functional bug → open a GitHub issue.
- Security issue → see [SECURITY.md](SECURITY.md). **Do not** file a public issue.
