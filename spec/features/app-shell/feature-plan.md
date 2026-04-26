# Feature: app-shell

## Summary
The foundational scaffold of Demo Day Room. Establishes the Next.js App Router project, global layout, navigation system, session lifecycle, and onboarding UX. Every other feature is built on top of this.

## Scope
- Next.js 14+ App Router project with TypeScript strict mode
- Zustand v5 session state machine (6 states) persisted in localStorage
- Dual-tier navigation: 3 top-level phases (Brief | Room | Debrief) + per-phase sub-views
- Phase lock/unlock logic with visual state chips
- First-time onboarding modal (4-step walkthrough)
- Floating info circle (evaluation framework explainer popover)
- Anonymous session creation (UUID + 6-char session_code)
- Session recovery by session_code
- Cloud Run deployment configuration (Dockerfile + cloudbuild.yaml)
- Tailwind CSS + shadcn/ui base setup
- Framer Motion for page transitions and modal animations

## Out of Scope
- Authentication / user accounts
- Mobile layout (min-width guard: 1024px)
- Dark mode
- Multiple simultaneous active sessions in the same browser tab

---

## Component Inventory

### Pages / Routes
| Route | Purpose |
|---|---|
| `/` | Landing / active session redirect |
| `/session/[id]` | Main app shell — wraps all phases |
| `/session/[id]/brief` | Brief phase (sub-views: project, hackathon) |
| `/session/[id]/room` | Room phase (sub-views: pitch, qa) |
| `/session/[id]/debrief` | Debrief phase (sub-views: review, coach) |

### Layout Components
| Component | File | Purpose |
|---|---|---|
| `AppShell` | `components/shell/AppShell.tsx` | Root layout wrapper |
| `TopNav` | `components/shell/TopNav.tsx` | Phase tabs + session_code display |
| `PhaseTab` | `components/shell/PhaseTab.tsx` | Individual phase tab with lock state |
| `SubViewChips` | `components/shell/SubViewChips.tsx` | Sub-view status indicators |
| `CTAButton` | `components/shell/CTAButton.tsx` | Primary CTA — black pill button |
| `OnboardingModal` | `components/shell/OnboardingModal.tsx` | 4-step first-time walkthrough |
| `InfoCircle` | `components/shell/InfoCircle.tsx` | Floating evaluation framework popover |
| `SessionCodeBadge` | `components/shell/SessionCodeBadge.tsx` | Displays BR-XXXX code, click to copy |
| `MobileGuard` | `components/shell/MobileGuard.tsx` | Renders min-width warning below 1024px |

### State
| Store | File | Purpose |
|---|---|---|
| `useSessionStore` | `stores/sessionStore.ts` | Zustand v5 + persist — session state machine |

### API Routes
| Route | Method | Purpose |
|---|---|---|
| `/api/sessions` | POST | Create anonymous session → returns `{ id, session_code }` |
| `/api/sessions/[id]` | GET | Read session state from Supabase |
| `/api/sessions/recover` | GET | `?code=BR-4X9K` → returns `{ session_id }` |

---

## State Machine

States (in order): `draft` → `brief_ready` → `pitch_recorded` → `qa_completed` → `debrief_ready` → `completed`

Transitions are one-directional. State never goes backwards. Transitions are triggered by feature-specific API calls (not by the shell itself).

Phase unlock rules:
- `brief`: always unlocked
- `room`: unlocked when state ≥ `brief_ready`
- `debrief`: unlocked when state ≥ `qa_completed`

Sub-view unlock rules (within Brief):
- `project`: always unlocked
- `hackathon`: unlocked when state ≥ `draft` (i.e. session exists)

Sub-view unlock rules (within Room):
- `pitch`: unlocked when state ≥ `brief_ready`
- `qa`: unlocked when state ≥ `pitch_recorded`

Sub-view unlock rules (within Debrief):
- `review`: unlocked when state ≥ `qa_completed`
- `coach`: unlocked when state ≥ `debrief_ready`

---

## Onboarding Modal

- Trigger: `hasSeenOnboarding === false` in Zustand store on first `/session/[id]` mount
- 4 steps (each step is a full modal screen):
  1. Welcome — "Demo Day Room" title, one-sentence value proposition, supporting graphic
  2. The Loop — visual: Brief → Room → Debrief flow diagram with icons
  3. The Room — explain AI judges, what to expect from Q&A
  4. The Debrief — explain the fracture map and why it matters
- Navigation: forward only (Next / Get Started), no back button on step 1
- Dismiss: clicking "Get Started" on step 4 sets `hasSeenOnboarding = true`, closes modal
- Animation: Framer Motion `AnimatePresence` + horizontal slide between steps
- Cannot be dismissed by clicking outside or pressing Escape

---

## Floating Info Circle

- Position: fixed, bottom-right corner, z-index above content
- Trigger: click → shadcn/ui Popover opens
- Content: evaluation framework overview (4 scoring axes: VC / Domain Expert / User Advocate / Overall)
- Animation: Framer Motion scale-up on open
- Visible on all sub-views except during active Q&A session

---

## Design Tokens Applied
See `spec/constitution/tech-stack.md` — Design System section.
Font: Inter. Primary: #000000. Background: #f9f9ff. Card: rounded-3xl, 32px padding.
Header: radial gradient (rgba(135,165,230,0.8)).

---

## Dependencies
- Supabase: sessions table
- GCP Secret Manager: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
- Cloud Run: Dockerfile, cloudbuild.yaml
