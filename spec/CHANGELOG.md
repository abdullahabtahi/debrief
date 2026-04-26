# Changelog

All notable decisions, spec deviations, and shipped changes are recorded here in reverse chronological order.

---

## [Unreleased] — Phase 3 starting

### Planned
- Pitch recording UI: `PitchRecorder`, `CountdownRing`, `RecordingControls`, `VideoPreview`, `PlaybackPreview`, `UploadProgressBar`, `TranscriptStatusBanner`, `PitchSummaryCard`
- API routes: `POST /api/pitch/upload-url`, `POST /api/pitch/process`, `GET /api/pitch/status`
- Cloud Tasks handler: `POST /api/tasks/transcribe` (GCP STT v2 Chirp 3)
- Session state transition: `brief_ready` → `pitch_recorded`

---

## [2026-04-26] — Phase 2 complete + shell polish

### Shipped

#### Navigation
- Logo in `TopNav` converted from static `div` to `<Link href="/">` — provides a reliable exit from any session back to the home/sessions list
- Sub-tab "The event" renamed to "Your Hackathon" across `TopNav`, hackathon page heading, and `ProjectBriefForm` CTA
- `HackathonBriefForm` label changed from "Judging criteria & event context" to "Context & Judging Criteria"

#### Copy
- All em dashes removed from user-facing copy across the codebase (rule: no em dashes anywhere)
  - `BriefStatusBanner` failed state
  - `HackathonBriefForm` error alert
  - `ProjectBriefForm` inline error
  - `OnboardingModal` body copy (2 instances)
  - Landing page hero subtext
  - `layout.tsx` meta description
  - Sessions API error message

#### Session identity
- `SessionCodeBadge` simplified to show session code only — project name removed from badge since the identity pill in `TopNav` already owns the name display

#### New components (built by Claude Code, reviewed and patched)
- `useBriefSubmit` — shared validation + submit hook used by both brief forms
- `BriefStepIndicator` — "Step 1 of 2 / Step 2 of 2" dots shown at top of both brief forms
- `ExtractionProgress` — animated extraction log replacing the spinner. Live step stream, judge tiles activating progressively, elapsed timer

#### Bug fixes (Claude Code)
- `HackathonBriefForm` CTA was routing back to `/brief/project` instead of submitting. Fixed: now calls `useBriefSubmit.submit()` then navigates to project page which detects `isBriefExtracting` and shows `ExtractionProgress`
- `PDFUploadZone` state was lost on tab navigation. Fixed: state initialized to `'done'` and filename recovered from props on mount when `currentGcsPath` is set
- `BriefStatusBanner` CLS on appearance/disappearance. Fixed: outer wrapper has `min-h-[44px]`
- `BriefStatusBanner` now has `role="status"`, `aria-live="polite"`, `aria-atomic="true"`

### Spec deviations
- `OnboardingModal` has 5 steps; spec says 4. Low priority. Noted here, not changed.
- `PATCH /api/sessions/[id]` added (not in original spec) to persist user-set project name to `sessions.title`

---

## [2026-04-25] — Phase 2 (Brief) complete

### Shipped
- Project context form with `projectName` field (required), context textarea (min 50 chars), 2 PDF upload zones
- Hackathon context form with `hackathonContext` textarea
- GCS V4 signed URL upload (browser-direct, server never handles bytes)
- Brief extraction via Gemini Flash, async Cloud Tasks pipeline
- `BriefSummaryPreview` — extracted summary displayed after `brief_ready` transition
- `BriefStatusBanner` for extraction state feedback
- `PDFUploadZone` with drag-and-drop, progress, retry, and done states
- Session state transition: `draft` → `brief_ready`

### Data model additions (not in original spec)
- `projectName: string` added to `BriefDraft` in Zustand store
- `pitchDeckFilename: string | null` and `notesFilename: string | null` added to `BriefDraft` to survive tab navigation
- `isBriefExtracting: boolean` added to store — bridges page boundary so polling runs correctly after hackathon form submit + navigate
- `activeSessionTitle: string | null` added to store — drives `SessionCodeBadge` and identity pill in `TopNav`

---

## [2026-04-24] — Phase 1 (App Shell) complete

### Shipped
- Next.js App Router scaffold, TypeScript strict mode
- Zustand v5 session store with persist (localStorage key: `demo-day-room-session`)
- 6-state session machine: `draft → brief_ready → pitch_recorded → qa_completed → debrief_ready → completed`
- Dual-tier navigation: Brief / Room / Debrief phase tabs + sub-view tab row
- Phase lock/unlock logic
- `OnboardingModal` (5 steps, first-time only)
- `SessionCodeBadge` — click to copy session code
- `CTAButton` — black pill, primary + secondary variants
- `MobileGuard` — renders overlay below 1024px viewport
- Landing page: dual-mode (first-time hero vs returning sessions list)
- `RecentSessionCard` — session row with state badge, relative timestamp, dismiss
- Anonymous session creation: `POST /api/sessions` → `{ id, session_code }`
- `GET /api/sessions/[id]` — read session state
- `GET /api/sessions/recover?code=` — re-link session from code
- Tailwind v4 with `@theme inline` block (not `:root` variables — v4 breaking change)
- `serverExternalPackages` in `next.config.ts` to externalize GCP packages and avoid OOM

### Spec deviations
- `recentSessions` (capped at 8) and session list UI built early — spec placed this in Phase 7
- `removeRecentSession` action available in store
- Session list on landing page is done; only the Supabase-enrichment fetch for cross-device recovery remains for Phase 7

---

## Architecture decisions

| Decision | Rationale |
|---|---|
| Logo = home link, not just a logo | Only reliable exit from session back to `/` once deep in pitch/Q&A |
| Analytics at `/` below sessions list, not in TopNav | TopNav is session-scoped workflow. Analytics is global, cross-session |
| Cross-session analytics is read-only over `recentSessions` (localStorage) | No auth means no server-side aggregation across devices |
| `isBriefExtracting` flag persisted to localStorage | Bridges page navigation: hackathon form submits → navigate to project page → project page detects flag and starts polling without needing the hackathon form in the tree |
| `SessionCodeBadge` shows code only, identity pill shows name | Prevents name duplication in TopNav control bar |
