# Requirements: brief

## Functional Requirements

### FR-BRIEF-01: Project Context Textarea
- Large textarea, min 200px height, resizable vertically
- Placeholder: "Paste your project description, what it does, the problem it solves, your tech approach — anything that gives context. Don't worry about structure."
- No character limit enforced in UI (validation only on submit: > 50 chars)
- Text is auto-saved to Zustand local state on every keystroke (not submitted to API until CTA)

### FR-BRIEF-02: PDF Upload Zones
- Two upload zones in Project Context sub-view: "Pitch Deck (PDF)" and "Notes / Additional Context (PDF)"
- Both are optional
- Accepted: `application/pdf` only — other file types show inline error "Only PDF files are accepted"
- Max size: 20 MB — larger files show inline error "File too large (max 20 MB)"
- Upload flow:
  1. User selects/drops file → `POST /api/brief/upload-url` → get signed URL
  2. Browser uploads directly to GCS using signed URL (PUT request)
  3. On GCS 200, store GCS path in component state
  4. Show uploaded filename + size + green checkmark
- Remove button (×) clears the upload and GCS path from state
- Upload progress: indeterminate spinner while uploading

### FR-BRIEF-03: Hackathon Context Sub-View
- Single large textarea, min 200px height
- Placeholder: "Paste the hackathon brief, judging criteria, theme, prizes, or any constraints you're working within."
- Optional — can be left empty
- Submission proceeds even if empty

### FR-BRIEF-03b: Hackathon Guidelines URL Input
- One URL text input in Hackathon Context sub-view: "Event guidelines URL" — optional
- Placeholder: `https://devpost.com/software/... or event landing page`
- Stored in Zustand store as `hackathonGuidelinesUrl: string | null`
- If provided, `hackathon_guidelines_url` is included in the `POST /api/brief` body and stored in `hackathon_briefs.guidelines_url`
- Validated server-side with `z.string().url()` — invalid URLs rejected with 400
- Clears to null when input is emptied

### FR-BRIEF-02b: Re-submission is_active Management
- On re-submission: before creating new `project_briefs` / `hackathon_briefs` rows, set `is_active = false` on all existing rows for this `session_id`
- New rows created with `is_active = false` initially; set to `true` only after extraction succeeds
- This ensures MCP tool `get_project_brief` can always do `WHERE session_id = $1 AND is_active = true` to get the current brief

### FR-BRIEF-03b: Autosave Indicator
- Textarea content is synced to Zustand on every keystroke
- Show a subtle "Saved" label with checkmark that fades in 500ms after the last keystroke (debounced 500ms)
- Label fades out after 2 seconds
- Positioned below the textarea, secondary text color
- Never shows on initial mount — only after the first edit

### FR-BRIEF-04: Brief Submission
- CTA "Analyze Brief" triggers `POST /api/brief` with:
  - `session_id`
  - `project_context` (raw textarea value)
  - `pitch_deck_gcs` (GCS path if uploaded, null otherwise)
  - `notes_gcs` (GCS path if uploaded, null otherwise)
  - `hackathon_context` (raw textarea value, may be empty string)
  - `hackathon_guidelines_url` (URL string if provided, null otherwise)
- On API success: show `BriefStatusBanner` with "Analyzing your brief..." + spinner
- Submission is idempotent: if brief already exists for session, overwrite and re-enqueue extraction

### FR-BRIEF-06: Judge Brief Sub-View
- Third sub-tab under Brief phase: "Judge Brief"
- Route: `/session/[id]/brief/judge`
- Locked (greyed, no-op click) when `sessionState === 'draft'`; unlocked once `brief_ready` or later
- Displays `JudgeReadiness` component with 4 traffic-light dimensions: Data Strategy, Competitive Moat, Market Validation, Failure Modes
- **3-tier overall readiness badge** (top-right of card):
  - `Ready for Room` (green) — all dimensions green
  - `Caution` (amber) — no reds, ≥1 amber
  - `Vulnerable` (red) — any dimension red
- Traffic light logic in `src/lib/judgeLogic.ts` (`getTrafficLight`, `getReadinessLevel`)
- Data fetched via `/api/brief?session_id=` (server route) — never direct Supabase in client

### FR-BRIEF-06: Brief Summary Preview
- When session is `brief_ready` and user navigates back to Brief:
  - Show `BriefSummaryPreview` — collapsed card with extracted key points
  - "Edit Brief" button allows re-editing textarea and re-submitting
  - Re-submission creates new brief records and re-runs extraction
  - Session state stays `brief_ready` during re-extraction (does not regress)

### FR-BRIEF-07: Navigation Between Sub-Views
- "Continue to Hackathon Context" button on Project Context sub-view navigates to hackathon sub-view
- Back arrow on hackathon sub-view navigates back to project sub-view
- State (textarea contents, uploaded files) is preserved across sub-view navigation within the session

---

## Non-Functional Requirements

### NFR-BRIEF-01: Upload Reliability
- If GCS upload fails (network error), show retry button on the upload zone
- Signed URL TTL is 15 minutes — if user takes > 15 min, re-request URL on retry
- Never show a spinner indefinitely — timeout upload attempt at 60 seconds with error

### NFR-BRIEF-02: Extraction Failure Handling
- If Cloud Task fails (extraction agent errors), Cloud Task retries up to 3 times
- If all retries fail: set `status = 'failed'` in `project_briefs` table
- Frontend detects `status = 'failed'` in polling response — show error: "Brief analysis failed. Try submitting again."
- In failure case, CTA remains "Analyze Brief" (not "Go to Room") until extraction succeeds

### NFR-BRIEF-03: Re-submission Safety
- Re-submitting brief while extraction is in-progress cancels the in-flight task (mark old records `status = 'superseded'`)
- Only the most recent extraction result is used

### NFR-BRIEF-04: Empty Brief Warning
- If `project_context` is empty on "Analyze Brief" click: show inline validation error, do not submit
- If `hackathon_context` is empty: show soft suggestion toast "Adding hackathon context helps judges tailor questions" — do not block submission

---

## Acceptance Criteria

- [ ] Textarea accepts and preserves text input across page navigation
- [ ] PDF upload zone accepts only PDF files < 20 MB; shows error for others
- [ ] File uploads go directly to GCS, server does not receive binary content
- [ ] Uploaded file shows filename, size, checkmark; remove button clears it
- [ ] Hackathon guidelines URL input present in Hackathon Context sub-view (replaces PDF upload)
- [ ] `POST /api/brief` body includes `hackathon_guidelines_url` when present, null when absent
- [ ] `hackathon_briefs.guidelines_url` populated in Supabase after submission with guidelines URL
- [ ] Invalid URL rejected by server with 400 (Zod `z.string().url()` validation)
- [ ] Judge Brief tab (`/brief/judge`) visible in TopNav under Brief phase
- [ ] Judge Brief tab locked (greyed, no-op) when `sessionState === 'draft'`
- [ ] Judge Brief shows 4 traffic-light dimensions after `brief_ready`
- [ ] Overall badge shows 3-tier result: Ready for Room / Caution / Vulnerable
- [ ] "Analyze Brief" with empty project_context shows validation error, does not submit
- [ ] After submission, BriefStatusBanner shows "Analyzing..." state
- [ ] After extraction completes, session state transitions to `brief_ready`
- [ ] CTA transitions to "Go to Room" when `brief_ready`
- [ ] Navigating back to Brief after `brief_ready` shows BriefSummaryPreview
- [ ] Re-submitting brief re-runs extraction, session stays `brief_ready`
- [ ] Extraction failure after all retries shows error with retry CTA
- [ ] Hackathon context textarea is optional — submission proceeds without it
