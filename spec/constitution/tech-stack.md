# Tech Stack

## Guiding Principles
- GCP-native where possible (credits available)
- One Cloud Run service (no separate backend)
- Each layer does what it's best at — no overlap
- Secrets in GCP Secret Manager only
- Never proxy binary files through the server

---

## Frontend

| Concern | Technology | Notes |
|---|---|---|
| Framework | Next.js App Router | Full-stack, one repo, API routes co-located |
| Language | TypeScript | Strict mode |
| Styling | Tailwind CSS | Design tokens from DESIGN.md (Inter, institutional palette) |
| Components | shadcn/ui | Dialog, Tooltip, Progress, base components |
| Animations | Framer Motion | Page transitions, onboarding modal, info popover |
| State (client) | Zustand v5 + persist | Session state machine → localStorage |
| State (server) | TanStack Query | Supabase fetch, transcript polling, optimistic updates |
| Agent streaming | CopilotKit + AG-UI | Debrief streaming render, Coach useCopilotChat |

---

## Backend (Next.js API Routes on Cloud Run)

| Concern | Technology | Notes |
|---|---|---|
| Runtime | Node.js 24+ | ES modules |
| Validation | Zod | All API boundaries |
| Error format | { error: { code, message, details? } } | Standard envelope |
| Streaming | Transfer-Encoding: chunked | Required for Cloud Run + ADK SSE |

---

## AI / Agents

| Agent | Model | Framework | Pattern |
|---|---|---|---|
| Brief Extraction | gemini-3-flash-preview | Direct Vertex AI | Stateless, single call, async |
| Debrief | claude-opus-4-7 | ADK TypeScript (adk-js) | Structured output, AG-UI streaming |
| Coach | claude-opus-4-7 | ADK TypeScript (adk-js) | Multi-turn ReAct, useCopilotChat |
| Q&A Judges | gemini-3-flash-preview | Gemini Live API (Vertex AI) | WebSocket, 3 personas, native audio |

### ADK Configuration
- `DatabaseSessionService` → Supabase Postgres (persistent agent state)
- `ContextCacheConfig` and `TokenBasedContextCompactor`: **Python/Go only — NOT available in adk-js as of April 2026**
  - Debrief: fetch brief + transcript once per request (manual context injection)
  - Coach: manual summarization fallback (see coach/feature-plan.md)
- `MCP Toolbox` (@toolbox-sdk/adk): agents query Supabase via tools, not manual injection

> **Pre-build gate**: Before writing any agent code, verify that `adk-js` exports `DatabaseSessionService`, `TokenBasedContextCompactor`, `ContextCacheConfig`, and MCP Toolbox integration. The ADK cheatsheet covers Python only — TypeScript parity must be confirmed against the adk-js changelog and README. If any of these are absent, the persistence/streaming strategy changes before a line of agent code is written.

### ADK Session Tables
`DatabaseSessionService` creates its own tables in Supabase (typically `adk_sessions`, `adk_events`). These must be pre-migrated before agent initialization. Check the adk-js source for the exact schema and add to the Supabase migration.

### Gemini Live
- Auth: Vertex AI pattern — server issues short-lived Google OAuth access token via `google-auth-library`; browser initializes `@google/genai` with `{ vertexai: true, project, location: 'global' }`
- **Pre-implementation gate**: verify `gemini-3-flash-preview` supports Live API on Vertex AI `global` endpoint. Fallback: `gemini-2.0-flash-live-001` (known Live-capable model).
- Audio: PCM 16-bit 16kHz in (AudioWorklet; resample from mic native rate) / 24kHz out
- AudioContext must be created inside a user gesture handler (autoplay policy restriction)
- Turn capture: incremental (per turn, not batched)
- Reconnect: `SessionResumptionUpdate` handle-based (not token refresh)
- **Reconnect context**: With valid resumption handle, do NOT re-inject context. On cold reconnect only: re-send system prompt + captured turns from Supabase.
- **Speaker attribution**: Enforce via system prompt tag prefix (`[VC]`, `[DOMAIN_EXPERT]`, `[USER_ADVOCATE]`). Fallback: attribute to `lastKnownJudgeSpeaker` if tag absent.

---

## Infrastructure

| Concern | Technology | Notes |
|---|---|---|
| Deployment | GCP Cloud Run | min-instances=1, timeout=600s, cpu-boost |
| CDN | Cloud CDN + Load Balancer | HTTPS termination, DDoS protection |
| Database | Supabase Postgres | App tables (sessions, artifacts, turns) + ADK session tables |
| DB Pooling | Supabase Supavisor | Transaction mode, connection_limit=25 |
| File Storage | GCP Cloud Storage | All binaries (video, PDF) — never Supabase Storage |
| GCS Lifecycle | Object lifecycle policy | Delete sessions/*/pitches/ and sessions/*/briefs/ after 30 days |
| Upload pattern | V4 GCS resumable signed URL | Browser-direct, server never handles bytes |
| Transcription | GCP STT v2 Chirp 3 | Async via Cloud Tasks after pitch upload |
| Job Queue | GCP Cloud Tasks | Brief extraction + STT pipeline |
| Secrets | GCP Secret Manager | All API keys, service account credentials |

---

## Design System

| Token | Value |
|---|---|
| Font | Inter (all weights) |
| Primary | #000000 |
| Background | #f9f9ff |
| Surface | #ffffff |
| On-surface | #111c2d |
| Header gradient | radial-gradient(circle at 50% 0%, rgba(135,165,230,0.8), transparent 50%) |
| Card radius | rounded-3xl (24px) |
| Card padding | 32px |
| Page margin | 48px |
| Section gap | 64px |
| CTA button | Black pill (rounded-full, bg-black, text-white) |

---

## API Route Contracts

| Route | Method | Purpose |
|---|---|---|
| /api/sessions | POST | Create session → returns { id, session_code } |
| /api/sessions/[id] | GET | Read session state |
| /api/sessions/recover | GET | ?code=BR-4X9K → re-link session |
| /api/brief | POST | Save brief → enqueue extraction |
| /api/brief/upload-url | POST | Issue V4 GCS signed URL for PDF |
| /api/qa/token | POST | Issue Gemini Live ephemeral token |
| /api/qa/token/refresh | POST | Refresh expired token on reconnect |
| /api/qa/turn | POST | Write single Q&A turn (incremental) |
| /api/qa/heartbeat | POST | Update last_heartbeat_at |
| /api/qa/end | POST | Finalize qa_session record |
| /api/pitch/upload-url | POST | Issue V4 GCS resumable signed URL |
| /api/pitch/process | POST | Trigger Cloud Tasks STT job |
| /api/pitch/status | GET | Poll transcript readiness |
| /api/debrief | POST | Invoke Debrief Agent (AG-UI stream) |
| /api/debrief | GET | Read existing debrief output (?session_id=) |
| /api/debrief/warm | POST | Pre-warm ADK context cache on debrief mount |
| /api/coach | POST | Invoke Coach Agent (CopilotKit) |
| /api/coach/messages | GET | Load coach message history (?session_id=&debrief_id=) |
| /api/tasks/brief-extraction | POST | Internal — Cloud Tasks OIDC-protected |
| /api/tasks/transcribe | POST | Internal — Cloud Tasks OIDC-protected |

---

## Key Constraints
1. **No auth** — sessions keyed by UUID in localStorage + 6-char session_code for recovery
2. **Desktop only** — min-width 1024px guard, no mobile layout in MVP
3. **One dominant CTA per screen** — always moves founder toward next step
4. **Brief screen: no structured fields** — textarea + file upload only, AI extracts structure
5. **Q&A turns written incrementally** — never batch, data loss prevention
6. **ADK state in Supabase** — never in-memory (Cloud Run horizontal scaling)
7. **Cloud Tasks handlers are OIDC-protected** — verify `Authorization: Bearer <token>` from Cloud Tasks service account on every internal task handler; reject all other callers with 403
8. **qa_turns has UNIQUE(qa_session_id, sequence_number)** — turn writes use upsert (`INSERT ... ON CONFLICT DO NOTHING`) to handle retry duplicates silently
9. **Schema integrity rules**:
   - `project_briefs` and `hackathon_briefs` have `is_active bool` and `created_at`. Only the most recent successful extraction row is `is_active = true`. MCP tools query `WHERE session_id = $1 AND is_active = true`
   - `hackathon_briefs.raw_context` — not `raw_guidelines` (renamed for consistency)
   - `pitch_recordings.mime_type` — stored from `MediaRecorder.mimeType` at upload time; required by STT Cloud Task for encoding parameter
   - `qa_sessions.pitch_recording_id FK` — records which transcript judges heard
   - `debriefs.qa_session_id FK` — deterministic turn lookup; resolved at debrief creation time as most recent `status = 'ended'` qa_session
   - `debriefs.output jsonb` — single JSONB for complete DebriefOutput; no split scalar columns
   - `coach_messages.debrief_id FK` — scopes conversation to specific debrief version; fresh coach on re-run
   - `coach_messages` has `UNIQUE INDEX (debrief_id, sequence_number)` — `INSERT ... ON CONFLICT DO NOTHING` to handle retry duplicates (same pattern as qa_turns)
   - All `state`/`status`/`role`/`speaker` columns have CHECK constraints
   - `sessions.last_active_at` updated by Postgres trigger on every row UPDATE
   - `sessions.title` written by brief extraction Cloud Task from `extracted_summary.problem`
10. **Supabase RLS on all app tables** — policies restricted to `service_role` only. Server-side code always uses service role key (bypasses RLS correctly). RLS blocks cross-session reads if anon key is ever accidentally used (defense-in-depth, not functional change)
10. **ADK agent singleton at startup** — initialize `DatabaseSessionService`, MCP Toolbox tool registration, and Vertex AI auth in `instrumentation.ts` (Next.js server startup hook), not inside route handlers. Runs once per container, not once per request
11. **pitch_recordings has transcript_quality JSONB** — heuristic computed after STT (word_count, estimated_wpm, filler_word_pct); injected into Debrief agent system prompt for delivery scoring calibration
12. **sessions has coaching_tip TEXT** — generated by Gemini Flash after transcript is ready; displayed on pitch sub-view before Q&A entry
13. **debriefs has debrief_progress JSONB and coach_opening_prompts JSONB** — progress is written incrementally during stream; coach_opening_prompts is generated after stream completes (no extra LLM, derived from fracture_map + qa_vulnerabilities)
