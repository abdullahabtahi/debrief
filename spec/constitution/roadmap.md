# Roadmap

## MVP Scope (1-week hackathon build)
Build the shortest convincing end-to-end loop. Every feature must serve the core rehearsal workflow.

## Feature Build Order

### Phase 1 — App Shell ✅ COMPLETE
**Feature:** `app-shell`
- Next.js App Router project scaffold
- Cloud Run deployment configuration
- Zustand session state machine (6 states) — per-session `briefDraft` isolation via `briefDrafts: Record<string, BriefDraft>`
- Dual-tier navigation (Brief | Room | Debrief) — TopNav with phase tabs + sub-tabs
- Phase lock indicators + sub-view status chips
- First-time onboarding modal (4-step walkthrough)
- Floating info circle (evaluation framework explainer)
- Anonymous session creation (UUID + session_code)
- localStorage session persistence
- Session recovery via session_code

### Phase 2 — Brief ✅ COMPLETE
**Feature:** `brief`
- Project Context screen: textarea + 2 PDF upload zones (pitch deck, notes)
- Hackathon Context screen: textarea + optional URL input (Devpost / event page)
- GCS signed URL upload (V4, browser-direct) for project PDFs only
- Brief Extraction Agent (Gemini Flash, async via Cloud Tasks or inline dev mode)
- Silent extraction → extracted_summary written to Supabase
- Session state transition: draft → brief_ready
- **Judge Brief sub-view** (`/brief/judge`): adversarial readiness assessment
  - 4 traffic-light dimensions: Data Strategy, Competitive Moat, Market Validation, Failure Modes
  - 3-tier overall badge: Ready for Room / Caution / Vulnerable
  - Locked until `brief_ready`; data fetched via `/api/brief` route (client-safe)

### Phase 3 — Pitch Recording ✅ COMPLETE
**Feature:** `pitch-recording`
- MediaRecorder (video + audio) in browser
- Visible countdown timer ring
- Lock recording → upload to GCS via resumable signed URL
- Async STT pipeline: Cloud Tasks → Speech-to-Text v2 REST API (Chirp 3) → transcript stored
- Transcript polling (TanStack Query)
- Session state transition: brief_ready → pitch_recorded

### Phase 4 — Q&A Room
**Feature:** `qa-room`
- Gemini Live WebSocket connection (ephemeral token, browser-direct)
- AudioWorklet audio pipeline (PCM 16-bit 16kHz in / 24kHz out)
- 3 judge personas in single system prompt (VC, Domain Expert, User Advocate)
- Zoom-like room layout: founder video dominant, judge tiles secondary
- Active speaker indicator per tile
- Session timer
- Incremental turn capture → POST /api/qa/turn per turn
- 30s heartbeat → last_heartbeat_at
- Token refresh on WebSocket reconnect
- Session state transition: pitch_recorded → qa_completed

### Phase 5 — Debrief
**Feature:** `debrief`
- Debrief Agent (claude-opus-4-7 via ADK TypeScript)
- MCP Toolbox reads all session artifacts
- ContextCacheConfig on brief + pitch transcript
- Structured DebriefOutput (verdict, fracture_map, strengths, weaknesses, next_drill)
- AG-UI streaming render via CopilotKit
- Fracture map visual (3 axes: VC / Domain Expert / User Advocate)
- Session state transition: qa_completed → debrief_ready

### Phase 6 — Coach
**Feature:** `coach`
- Coach Agent (claude-opus-4-7 via ADK TypeScript)
- TokenBasedContextCompactor (tokenThreshold=8000)
- useCopilotChat hook (AG-UI + CopilotKit)
- Post-mortem conversational tone
- Session state transition: debrief_ready → completed

### Phase 7 — Sessions
**Feature:** `sessions`
- Session list view (date, title, state, session_code)
- Link to debrief artifact per session
- Session recovery flow (enter session_code)

## Post-Hackathon Backlog (not in MVP)
- Analytics view (delivery trends, repeated failure points)
- User authentication (Supabase Auth, magic link)
- Dark mode
- Mobile responsive layout
- PDF export of Debrief artifact
- Video playback of pitch recording in Debrief
- Pitch re-recording comparison view
- Multiple judge panel configurations

## Success Criteria for Hackathon Demo
1. End-to-end flow works: Brief → Pitch → Q&A → Debrief → Coach
2. Debrief fracture map renders with all 3 axes populated
3. Q&A judges ask domain-relevant adversarial questions
4. Coach responds using specific evidence from the debrief
5. UI feels institutional, calm, and high-stakes (not like a chatbot)
