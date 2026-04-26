# Feature: debrief

## Summary
The Debrief is the hero artifact of Demo Day Room. The Debrief Agent (claude-opus-4-7 via ADK TypeScript) reads all session artifacts through MCP Toolbox, produces a structured DebriefOutput, and streams it to the frontend via AG-UI + CopilotKit. The result is rendered as a fracture map (3 axes), strengths, weaknesses, and a next drill prescription. Session transitions to `debrief_ready`.

## Scope
- Debrief Agent: claude-opus-4-7, ADK TypeScript (adk-js), DatabaseSessionService
- ContextCacheConfig on brief + transcript context
- MCP Toolbox tools for reading session artifacts
- Structured DebriefOutput schema
- AG-UI streaming render via CopilotKit
- Fracture map visual: 3 axes (VC / Domain Expert / User Advocate) + overall score
- Session state transition: `qa_completed` → `debrief_ready`
- Debrief is deterministic per session — re-running generates a new attempt, not overwriting

## Out of Scope
- PDF export of debrief
- Video playback of pitch in debrief
- Multiple debrief comparison view
- Real-time streaming of fracture map scores (scores are post-stream)

---

## Component Inventory

### Pages / Routes
| Route | Purpose |
|---|---|
| `/session/[id]/debrief/review` | Debrief review sub-view |

### UI Components
| Component | File | Purpose |
|---|---|---|
| `DebriefView` | `components/debrief/DebriefView.tsx` | Root debrief layout |
| `DebriefTriggerCard` | `components/debrief/DebriefTriggerCard.tsx` | Pre-debrief state — "Get Debrief" CTA |
| `DebriefStreamingView` | `components/debrief/DebriefStreamingView.tsx` | Renders streaming debrief content |
| `FractureMap` | `components/debrief/FractureMap.tsx` | 3-axis score visualization |
| `FractureAxis` | `components/debrief/FractureAxis.tsx` | Single axis score bar with label |
| `VerdictCard` | `components/debrief/VerdictCard.tsx` | Overall verdict summary card |
| `FindingsList` | `components/debrief/FindingsList.tsx` | Strengths / Weaknesses list |
| `IssuesList` | `components/debrief/IssuesList.tsx` | Narrative / Delivery / QA issues |
| `NextDrillCard` | `components/debrief/NextDrillCard.tsx` | Single actionable next drill prescription |
| `DebriefSectionNav` | `components/debrief/DebriefSectionNav.tsx` | Sticky section nav pills (Verdict · Fracture Map · Strengths · Weaknesses · Issues · Drill) — pills disabled until section state arrives |

### Hooks / Data Fetching
| Hook | File | Purpose |
|---|---|
---|
| `useDebriefQuery` | `hooks/useDebriefQuery.ts` | TanStack Query `GET /api/debrief?session_id=` — loads existing debrief; Zod-validates `output` JSONB before returning; used on mount to skip re-invocation when `status = 'complete'` |

### API Routes
| Route | Method | Purpose |
|---|---|---|
| `/api/debrief` | POST | Invoke Debrief Agent (AG-UI SSE stream) |
| `/api/debrief` | GET | Read existing debrief output `?session_id=` → returns `{ output, status, attempt_number, created_at }` for active debrief |
| `/api/debrief/warm` | POST | Pre-warm ADK context cache — fires MCP reads on debrief mount |

---

## Debrief Agent Architecture

**Model**: `claude-opus-4-7`
**Framework**: ADK TypeScript (`adk-js`)
**Session service**: `DatabaseSessionService` → Supabase (agent state persists)
**Streaming**: AG-UI Protocol → CopilotKit on frontend

### Context Caching
`ContextCacheConfig` is Python/Go only — not available in `@google/adk` TypeScript.

Mitigation: session artifacts are fetched once by MCP Toolbox tools at the start of the debrief call and embedded in the agent context for that single invocation. The `/api/debrief/warm` pre-fetch on `DebriefTriggerCard` mount compensates for the lack of caching by ensuring data is in Supabase's hot path before the agent fires.

### MCP Toolbox Tools
Agent reads artifacts via MCP Toolbox (`@toolbox-sdk/adk`):
| Tool | Returns |
|---|---|
| `get_project_brief` | ProjectBriefSummary JSON |
| `get_hackathon_brief` | HackathonBriefSummary JSON |
| `get_pitch_transcript` | Full transcript text |
| `get_qa_turns` | All turns in order (speaker, content, timestamp) |

### Output Schema (structured output)
```typescript
interface DebriefOutput {
  verdict: string                     // 2-3 sentence overall assessment
  fracture_map: {
    vc: FractureScore
    domain_expert: FractureScore
    user_advocate: FractureScore
    overall_score: number             // 0-10
  }
  strengths: Finding[]                // max 5
  weaknesses: Finding[]               // max 5
  narrative_issues: Issue[]           // storyline / structure problems
  delivery_issues: Issue[]            // pacing, clarity, filler words
  qa_vulnerabilities: Issue[]         // questions the founder couldn't answer
  next_drill: string                  // single most important action item
}

interface FractureScore {
  score: number                       // 0-10
  // label NOT in schema — derived on frontend via scoreToLabel(score)
  // 0-3 → "Critical" | 4-5 → "Developing" | 6-7 → "Adequate" | 8-10 → "Strong"
  top_concern: string                 // 1 sentence
}

interface Finding {
  title: string
  explanation: string
}

interface Issue {
  title: string
  evidence: string                    // quote or specific example from session
  recommendation: string
  persona?: 'vc' | 'domain_expert' | 'user_advocate' | null  // which judge raised this; drives FractureAxis hover tooltip routing
}
```

---

## AG-UI Streaming Integration

> **Critical constraint**: `withOutputSchema()` in adk-js disables tool usage. Since the Debrief Agent requires MCP Toolbox tools (`get_project_brief`, `get_pitch_transcript`, `get_qa_turns`), do **NOT** use `withOutputSchema`. Enforce output structure via system prompt and validate with Zod in the route handler at stream end.

### Streaming Pattern: useCoAgent + STATE_DELTA

The route handler converts ADK stream events into AG-UI `STATE_DELTA` events (JSON Patch, RFC 6902). As each section of `DebriefOutput` completes in the streamed agent output, the handler emits a delta. The frontend reacts via `useCoAgent`.

```typescript
// Frontend hook (debrief view)
const { state } = useCoAgent<Partial<DebriefOutput>>({
  name: 'debrief_agent',
  initialState: {} as Partial<DebriefOutput>,
})

// Reactive render: each section appears as the STATE_DELTA arrives
useCoAgentStateRender<Partial<DebriefOutput>>({
  name: 'debrief_agent',
  render: ({ state }) => <DebriefStreamingView output={state} />,
})
```

Route handler emits AG-UI events in this sequence:
1. `RUN_STARTED`
2. `TEXT_MESSAGE_START` → `TEXT_MESSAGE_CONTENT` deltas (verdict prose streams word-by-word)
3. `TEXT_MESSAGE_END`
4. `STATE_DELTA` `{ op: 'add', path: '/verdict', value: '...' }` → VerdictCard appears
5. Repeat per section: `fracture_map` → `strengths` → `weaknesses` → `narrative_issues` → `delivery_issues` → `qa_vulnerabilities` → `next_drill`
6. `RUN_FINISHED`

Frontend sections appear in order as state arrives:
1. Verdict → `VerdictCard` appears
2. Fracture map scores → `FractureMap` animates in
3. Strengths/Weaknesses → `FindingsList` populates
4. Issues → `IssuesList` populates
5. Next drill → `NextDrillCard` appears

## debrief_progress Incremental Write Pattern

The `/api/debrief` route handler wraps the AG-UI stream. It uses an ADK **after_tool_call** callback (or equivalent stream interceptor in adk-js) to write each completed section to Supabase as it arrives:

```
On each STATE_DELTA emitted (section complete):
  → PATCH debriefs SET debrief_progress = debrief_progress || $section_json::jsonb
    (use || merge operator, NOT jsonb_set — prevents lost-update races on concurrent patches)
  → forward STATE_DELTA to client SSE (do NOT await the PATCH — fire-and-forget)

Stream complete (use afterAgentCallback — confirmed available in adk-js):
  → Zod-validate accumulated DebriefOutput before writing
  → UPDATE debriefs SET output = debrief_progress, status = 'complete'
  → UPDATE sessions SET state = 'debrief_ready'
```

The PATCH calls are fire-and-forget (do not await before forwarding to client). If a PATCH fails, log it — do not abort the stream. The goal is best-effort persistence; the live client still gets the full stream.

**afterAgentCallback in adk-js**: Confirmed available. Signature: `afterAgentCallback: (callbackContext: CallbackContext) => Content | undefined`. Use this for the final write. Section-level writes happen inline in the route handler's SSE loop.

---

## Fracture Map Visual

3 horizontal score bars (0-10 scale):
- VC: label, score bar, `top_concern` below
- Domain Expert: label, score bar, `top_concern` below
- User Advocate: label, score bar, `top_concern` below
- Overall score: large number + circular gauge

Score labels (frontend-derived via `scoreToLabel(score: number)` — NOT from agent):
- 0-3: "Critical" (red)
- 4-5: "Developing" (amber)
- 6-7: "Adequate" (yellow)
- 8-10: "Strong" (green)

---

## Debrief Attempt Tracking

- Each debrief invocation creates a new `debriefs` record with `attempt_number`
- Most recent `is_active = true` record is what the user sees
- Previous attempts are kept (not deleted) for potential future analytics
- Re-running debrief: mark previous `is_active = false`, create new record

---

## Dependencies
- Supabase: `debriefs`, `sessions` tables, ADK session tables
- ADK TypeScript (adk-js): agent runtime
- MCP Toolbox: database tool calls
- Vertex AI: claude-opus-4-7 endpoint
- GCP Secret Manager: credentials
- Migration: `migrations/003_debrief.sql` — must include:
  ```sql
  -- Prevents two is_active=true rows per session at DB level (enforced even if app logic races)
  CREATE UNIQUE INDEX idx_debriefs_session_active ON debriefs(session_id) WHERE is_active = true;
  ```
