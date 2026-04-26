# Requirements: sessions

## Functional Requirements

### FR-SESS-01: Session List from localStorage
- On landing page mount, read all `sessionIds` from Zustand persist store
- Render one `SessionCard` per session ID
- If `sessionIds` is empty: render empty state ("No sessions yet. Start your first session.")

### FR-SESS-02: Session Card Enrichment
- For each session ID: fetch `GET /api/sessions/[id]` using TanStack Query
- Initial render uses localStorage data (state, session_code)
- Updates when Supabase data returns (title hint from extracted_summary)
- If Supabase returns 404: show "Session not available" card with option to remove from list
- If Supabase unreachable: show localStorage data only (no error)

### FR-SESS-03: Session Card — Title
- If `project_briefs.extracted_summary.problem` exists: use first 60 chars as title
- If extracted_summary not yet available: show "Untitled Session"
- Truncate with ellipsis if > 60 chars

### FR-SESS-04: Session Card — Date
- Show relative date: "Just now" (< 1 min), "X minutes ago", "X hours ago", "Yesterday", "Apr 23"
- Date source: `sessions.last_active_at` from Supabase (fallback: localStorage creation timestamp)

### FR-SESS-05: Session Card — State Badge
- State chip with color and label per the mapping in feature-plan.md
- Badge updates in real-time as TanStack Query refreshes

### FR-SESS-06: Session Card — CTA
- "Continue" for in-progress sessions, "View Debrief" for completed
- Navigates to correct sub-view per state mapping in feature-plan.md
- Sets `activeSessionId` in Zustand store before navigating

### FR-SESS-07: Remove Session
- "Remove" link on each SessionCard
- Removes the session ID from `sessionIds[]` in Zustand/localStorage
- Does NOT delete the session from Supabase
- Card disappears immediately (optimistic)
- If removed session was `activeSessionId`: clear `activeSessionId`

### FR-SESS-08: Start New Session
- "Start New Session" button calls `POST /api/sessions` → gets `{ id, session_code }`
- Adds `id` to `sessionIds[]`, sets `activeSessionId = id`
- Navigates to `/session/[id]/brief`
- Onboarding modal is NOT shown (it's only for the very first session ever)
- Actually: re-check `hasSeenOnboarding` — if false (truly first time), show onboarding

### FR-SESS-09: Recovery Form
- Input: plain text, max 10 chars, auto-uppercase
- "Recover Session" button calls `GET /api/sessions/recover?code=...`
- On success:
  - Add `session_id` to `sessionIds[]` if not already present
  - Set `activeSessionId = session_id`
  - Navigate to `/session/[id]` (correct sub-view per state)
- On failure (404): show inline error "Session not found. Check the code and try again."
- Input cleared on success

### FR-SESS-10: Redirect if Active Session
- If `activeSessionId` is set in Zustand store on landing page load: redirect to `/session/[activeSessionId]`
- This prevents founders from seeing the list when they have an active in-progress session
- Exception: if the user navigates explicitly to `/` (e.g. via browser back), show the list (do not force-redirect)

---

## Non-Functional Requirements

### NFR-SESS-01: Performance
- Session list renders from localStorage immediately (< 100ms)
- Supabase enrichment is non-blocking background fetch

### NFR-SESS-02: Session Count
- Max sessions displayed: 10 (trim oldest from localStorage list if > 10)
- This prevents localStorage bloat and UI clutter

### NFR-SESS-03: Stale Session Detection
- Sessions with Supabase 404 are shown as "Session not available" — not silently hidden
- User must explicitly remove stale sessions

---

## Acceptance Criteria

- [ ] Landing page renders session list immediately from localStorage
- [ ] Session cards show correct title, date, state badge, session_code
- [ ] "Continue" navigates to correct sub-view per session state
- [ ] "View Debrief" navigates to debrief review for completed sessions
- [ ] "Remove" removes session from list, not from Supabase
- [ ] Recovery form: valid code navigates to session; invalid code shows error
- [ ] "Start New Session" creates session, navigates to brief
- [ ] Supabase 404 sessions shown as "not available" with remove option
- [ ] Active session redirect works (going to `/` when activeSessionId set)
- [ ] Session list empty state shown when no sessions in localStorage
