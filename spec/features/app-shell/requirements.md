# Requirements: app-shell

## Functional Requirements

### FR-SHELL-01: Session Creation
- On first load (no `sessionId` in localStorage), the app calls `POST /api/sessions`
- Response must include `{ id: string, session_code: string }` where `session_code` matches pattern `^[A-Z]{2}-[A-Z0-9]{4}$`
- Both values are persisted to localStorage via Zustand persist middleware
- User is redirected to `/session/[id]/brief`
- **Collision handling**: `session_code` has a UNIQUE constraint in Supabase. If the insert hits a unique violation, the API route regenerates the code and retries once before returning a 500. This prevents an unhandled crash on the one-in-a-billion collision.

### FR-SHELL-02: Session Persistence
- Zustand store uses `persist` middleware with `localStorage` as storage
- On every page load, store is rehydrated from localStorage before rendering
- If `activeSessionId` exists in localStorage and session exists in Supabase, resume session
- If session not found in Supabase (deleted or expired), clear localStorage and create new session

### FR-SHELL-03: Session Recovery
- Recovery UI: input field for session_code + "Recover Session" button
- Calls `GET /api/sessions/recover?code=BR-4X9K`
- On success: sets `activeSessionId` in Zustand, redirects to `/session/[id]/brief`
- On failure (code not found): shows inline error "Session not found. Check the code and try again."
- Recovery is accessible from the landing page `/`

### FR-SHELL-04: Navigation — Phase Tabs
- Three phase tabs rendered in TopNav: Brief | Room | Debrief
- Each tab shows phase name + lock icon (if locked) or status chip (if unlocked)
- Clicking a locked phase tab does nothing (no navigation, no error)
- Clicking an unlocked phase tab navigates to that phase's default sub-view
- Active phase tab is visually distinct (black underline or pill)

### FR-SHELL-05: Navigation — Sub-View Chips
- Sub-view chips are rendered below the phase tabs on each phase page
- Each chip shows sub-view name + completion status (dot color: gray=locked, blue=active, green=done)
- Clicking a locked chip does nothing
- Clicking an unlocked chip navigates to that sub-view

### FR-SHELL-06: CTA Button
- One CTAButton rendered per screen, always at the bottom of the main content area
- Label and action are derived from `currentCTA()` in Zustand store
- CTA mapping:
  | Session State | Active Sub-View | CTA Label | CTA Action |
  |---|---|---|---|
  | draft | project | Continue to Hackathon Context | navigate to hackathon |
  | draft | hackathon | Analyze Brief | submit brief |
  | brief_ready | any brief view | Go to Room | navigate to /room/pitch |
  | brief_ready | pitch | Record Pitch | start recording |
  | pitch_recorded | pitch | Go to Q&A | navigate to /room/qa |
  | pitch_recorded | qa | Start Q&A Session | start qa |
  | qa_completed | qa | View Debrief | navigate to /debrief/review |
  | qa_completed | review | Get Debrief | trigger debrief agent |
  | debrief_ready | review | Talk to Coach | navigate to /debrief/coach |
  | completed | coach | (no CTA — session complete) | — |

### FR-SHELL-07: Onboarding Modal
- Shown exactly once, on first session creation, before any content is visible
- 4 steps rendered as full-modal screens with Framer Motion slide animation
- Step progression: forward only (no back on step 1, back on steps 2-4)
- "Get Started" on step 4 dismisses modal and sets `hasSeenOnboarding = true`
- Cannot be dismissed any other way (no outside click, no Escape key)
- Not shown on session recovery (only on fresh session creation)

### FR-SHELL-08: Floating Info Circle
- Fixed position: bottom-right, 24px from edges, z-50
- Renders on all sub-views except during active Q&A (qa sub-view when qa_session is active)
- Click opens shadcn/ui Popover with evaluation framework overview
- Popover content: description of 4 scoring axes with 1-sentence explanation each

### FR-SHELL-09: Session Code Display
- SessionCodeBadge renders in TopNav, right side
- Shows the session_code (e.g. "BR-4X9K")
- Click copies code to clipboard and shows "Copied!" toast for 2 seconds

### FR-SHELL-10: Mobile Guard
- If viewport width < 1024px, render MobileGuard fullscreen overlay
- Content: "Demo Day Room is designed for desktop. Please open on a device with at least 1024px width."
- No app content visible behind guard

---

## Non-Functional Requirements

### NFR-SHELL-01: Performance
- Initial page load (cold start excluded): < 2 seconds to interactive
- Zustand rehydration must complete before first render (no hydration flash)
- Use `suppressHydrationWarning` on localStorage-dependent elements to prevent SSR mismatch

### NFR-SHELL-02: Resilience
- If `POST /api/sessions` fails, retry once after 1 second, then show error UI: "Could not start session. Refresh to try again."
- If Supabase is unreachable, app shows error state rather than silently hanging

### NFR-SHELL-03: Accessibility
- Phase tabs are keyboard navigable (Tab key)
- Onboarding modal traps focus while open
- All interactive elements have visible focus rings

### NFR-SHELL-04: No Auth
- No login, no signup, no email required
- Session ownership is implicit — whoever has the localStorage entry owns the session
- session_code is the only sharing/recovery mechanism

---

## Acceptance Criteria

- [ ] Fresh browser load creates a session and persists it in localStorage
- [ ] Refreshing the page resumes the same session without re-creating
- [ ] Entering a valid session_code in recovery flow navigates to correct session
- [ ] Invalid session_code shows error message, does not navigate
- [ ] Phase tabs: Brief always clickable, Room locked until `brief_ready`, Debrief locked until `qa_completed`
- [ ] CTA button label matches expected value for each session state + sub-view combination
- [ ] Onboarding modal appears on first session creation, not on recovery, not on page refresh
- [ ] Onboarding modal cannot be dismissed except via "Get Started" on step 4
- [ ] Info circle popover opens and closes on click
- [ ] Session code badge copies to clipboard on click, shows "Copied!" toast
- [ ] Viewport < 1024px shows MobileGuard, no app content visible
- [ ] Cloud Run deployment: service starts, handles requests, min-instances=1
