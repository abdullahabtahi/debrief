# Feature: sessions

## Summary
The Sessions feature provides a session list view showing all sessions the user has worked on (stored in localStorage), with their state, date, and session_code. It enables the session recovery flow (enter code to re-link) and links to completed debrief artifacts. This is the entry point for founders returning after closing the browser.

## Scope
- Session list view: all sessions from localStorage, enriched from Supabase
- Per-session: date, title (extracted from brief summary if available), state chip, session_code
- Link to debrief artifact for sessions with state ≥ `debrief_ready`
- Session recovery flow: input session_code → re-link session
- "Continue" action for in-progress sessions
- Local sessions cleared when user explicitly removes them

## Out of Scope
- Server-side session listing (no auth, no user account)
- Sorting / filtering sessions (max ~5 sessions in localStorage for MVP)
- Session deletion from Supabase (only localStorage removal)
- Cross-device session sync without session_code

---

## Component Inventory

### Pages / Routes
| Route | Purpose |
|---|---|
| `/` | Landing page — session list + recovery |

### UI Components
| Component | File | Purpose |
|---|---|---|
| `LandingPage` | `app/page.tsx` | Root landing page |
| `SessionList` | `components/sessions/SessionList.tsx` | List of all localStorage sessions |
| `SessionCard` | `components/sessions/SessionCard.tsx` | Single session summary card |
| `SessionStateBadge` | `components/sessions/SessionStateBadge.tsx` | State chip (color-coded) |
| `RecoveryForm` | `components/sessions/RecoveryForm.tsx` | Session code input + recover button |
| `NewSessionButton` | `components/sessions/NewSessionButton.tsx` | "Start New Session" CTA |

---

## Session Card Content

Each `SessionCard` shows:
- **Title**: `extracted_summary.project.problem` (first 60 chars) if available, else "Untitled Session"
- **Date**: human-readable relative date ("2 hours ago", "Yesterday", "Apr 23")
- **State badge**: color-coded chip:
  | State | Label | Color |
  |---|---|---|
  | draft | In Progress | gray |
  | brief_ready | Brief Ready | blue |
  | pitch_recorded | Pitch Recorded | blue |
  | qa_completed | Q&A Done | orange |
  | debrief_ready | Debrief Ready | green |
  | completed | Completed | green |
- **Session code**: shown in secondary text (e.g. "BR-4X9K")
- **CTA**:
  - State < `debrief_ready`: "Continue" → navigate to `/session/[id]` (correct sub-view)
  - State ≥ `debrief_ready`: "View Debrief" → navigate to `/session/[id]/debrief/review`
- **Remove** link: removes session from localStorage list (does not delete from Supabase)

---

## Landing Page Layout

```
┌─────────────────────────────────────────────────────┐
│               Demo Day Room                         │
│         [tagline — one sentence]                    │
├─────────────────────────────────────────────────────┤
│  Your Sessions                [Start New Session]   │
│  ┌────────────────────────────────────────────────┐  │
│  │ [SessionCard]                                  │  │
│  └────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────┐  │
│  │ [SessionCard]                                  │  │
│  └────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────┤
│  Recover a Session                                  │
│  [session code input]     [Recover Session button]  │
└─────────────────────────────────────────────────────┘
```

If no sessions in localStorage: show only "Start New Session" CTA + recovery form.

---

## Session Enrichment

- On landing page mount, for each session ID in localStorage:
  - Call `GET /api/sessions/[id]` to get current state + title hint
  - If Supabase returns 404 (session deleted/expired): mark session as stale in display
- Enrichment is non-blocking: render cards from localStorage data immediately, update when Supabase responds (TanStack Query)

---

## Navigation on Session Click

"Continue" navigates to the correct sub-view based on session state:
| Session State | Destination |
|---|---|
| draft | `/session/[id]/brief` |
| brief_ready | `/session/[id]/room/pitch` |
| pitch_recorded | `/session/[id]/room/pitch` (shows re-record + "Go to Q&A") |
| qa_completed | `/session/[id]/debrief/review` |
| debrief_ready | `/session/[id]/debrief/review` |
| completed | `/session/[id]/debrief/coach` |

---

## Dependencies
- Supabase: `sessions`, `project_briefs` tables
- localStorage: `sessionIds[]`, `activeSessionId` via Zustand persist
