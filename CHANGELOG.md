# Changelog

All notable changes to Demo Day Room are recorded here.
Format: `[Phase] Type: Description`

---

## [Unreleased — Phase 4]
- Q&A Room: Gemini Live WebSocket + AudioWorklet + 3 judge personas

---

## Phase 3 Complete — Pitch Recording
_April 2026_

### Added
- MediaRecorder-based video+audio recording with countdown timer ring
- GCS resumable signed URL upload (`/api/pitch/upload-url`)
- STT pipeline: Cloud Tasks → Speech-to-Text v2 REST API (Chirp 3) → transcript stored in Supabase
- Transcript quality heuristics: `{word_count, estimated_wpm, filler_word_pct}` written to `pitch_recordings.transcript_quality`
- TanStack Query polling for transcript readiness (`/api/pitch/status`)
- Q&A Room stub page (`/session/[id]/room/qa`) — "Coming in Phase 4" placeholder
- Session state transition: `brief_ready` → `pitch_recorded`

### Fixed
- `transcribe.ts`: removed dependency on `@google-cloud/speech` (not installed). Replaced with direct Speech-to-Text v2 REST API call using `google-auth-library` for ADC token acquisition.

---

## Phase 2 Complete — Brief
_April 2026_

### Added
- Project Context sub-view: textarea + pitch deck + notes PDF upload zones
- Hackathon Context sub-view: textarea + event guidelines URL input (Devpost / event page)
- Brief Extraction Agent (Gemini Flash via Vertex AI) — inline dev mode + Cloud Tasks production path
- `BriefStatusBanner` and `BriefSummaryPreview` components
- **Judge Brief sub-view** (`/session/[id]/brief/judge`):
  - 4 adversarial readiness dimensions with traffic-light dots
  - 3-tier overall badge: `Ready for Room` / `Caution` / `Vulnerable`
  - Locked tab until `brief_ready`; data fetched via `/api/brief` (never direct Supabase in client)
- `src/lib/judgeLogic.ts`: pure logic for `getTrafficLight`, `isReadyForRoom`, `getReadinessLevel`
- `src/lib/judgeDataLoader.ts`: client-safe data fetcher for judge brief dimensions
- `TopNav.tsx`: added Judge Brief as 3rd sub-tab under Brief phase with lock state
- 17 unit tests for judge brief logic (`src/test/judgeBrief.test.ts`)

### Changed
- **Hackathon guidelines: PDF upload → URL input**
  - `BriefDraft.hackathonGuidelinesGcs` + `hackathonGuidelinesFilename` removed
  - Replaced with `BriefDraft.hackathonGuidelinesUrl: string | null`
  - `POST /api/brief` body: `hackathon_guidelines_gcs` → `hackathon_guidelines_url`
  - Server validates with `z.string().url()`
  - `hackathon_briefs.guidelines_url` column replaces `guidelines_gcs`
  - `PDFUploadZone` no longer accepts `hackathon_guidelines` file type
  - `extractBrief.ts` prompt updated to reference URL instead of PDF path

### Fixed
- **Session isolation bug**: `briefDraft` was shared across sessions. Fixed by keying drafts in `briefDrafts: Record<string, BriefDraft>` map and syncing an explicit `briefDraft` field on session switch (`setSession`, `resumeSession`, `setBriefDraft`). The `get briefDraft()` getter approach did not survive Zustand `persist` middleware's JSON round-trip.
- **Judge Brief loading hang**: Page was importing `src/lib/supabase.ts` directly (uses `SUPABASE_SERVICE_ROLE_KEY`, undefined in browser). Replaced with fetch to `/api/brief?session_id=` server route.

---

## Phase 1 Complete — App Shell
_April 2026_

### Added
- Next.js 14 App Router scaffold (TypeScript strict mode)
- Zustand v5 + persist store (`sessionStore.ts`) with 6-state session machine
- `TopNav` phase tabs (Brief / Room / Debrief) + sub-tabs
- `SubViewChips` secondary navigation
- Onboarding modal (4-step walkthrough)
- Anonymous session creation (`POST /api/sessions`) — UUID + 7-char `session_code`
- Session recovery (`GET /api/sessions/recover?code=`)
- localStorage persistence with hydration guard
- Vitest + jsdom test environment configured (`vitest.config.ts`, `src/test/setup.ts`)
- 7 session isolation tests (`src/test/sessionIsolation.test.ts`)
