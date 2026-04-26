# Feature: coach

## Summary
The Coach is a post-mortem conversational agent (`gemini-2.5-flash` via `@iqai/adk`) that helps the founder act on the debrief. It uses a custom `useCoachStream` hook (raw SSE — same pattern as the Debrief agent) for multi-turn conversation. Context is managed manually: full `coach_messages` history is rebuilt from Supabase on every request (stateless-per-request, horizontal-scale safe). The Coach knows everything about the session — brief, transcript, Q&A turns, and debrief output — and responds with specific, evidence-backed guidance. Session transitions to `completed` on first message.

> **Audit note (2025-01):** Previous spec referenced `claude-opus-4-7`, `DatabaseSessionService`, `useCopilotChat`, and MCP Toolbox. All four are incompatible with the installed stack (`@iqai/adk` v0.8.5 + `GOOGLE_API_KEY`, `InMemorySessionService` only, no CopilotKit runtime endpoint). Spec corrected to match confirmed working patterns from Phase 5 (Debrief).

## Scope
- Coach Agent: `gemini-2.5-flash`, `@iqai/adk`, stateless-per-request (InMemorySessionService)
- Context compaction: manual 20-pair threshold, Gemini Flash summarizer, `is_summary` boolean on row
- Direct Supabase tools (same pattern as Debrief — no MCP Toolbox sidecar required)
- Custom `useCoachStream` hook for SSE streaming (no CopilotKit)
- Conversational UI: chat bubble layout with scroll-lock auto-scroll
- Coach sends a context-aware **opening message** on mount (coach speaks first, not founder)
- Session state transition: `debrief_ready` → `completed` (on first **founder** message sent)
- Conversation history persisted to `coach_messages` table (`is_summary` column added via migration)
- `coach_opening_prompts` written by `/api/debrief` at completion (prerequisite — implement in Phase 5 patch)

## Out of Scope
- Voice interface for coach
- Export of coach conversation
- CopilotKit / AG-UI protocol (no runtime endpoint — raw SSE used for consistency with Debrief)

---

## Component Inventory

### Pages / Routes
| Route | Purpose |
|---|---|
| `/session/[id]/debrief/coach` | Coach sub-view |

### UI Components
| Component | File | Purpose |
|---|---|---|
| `CoachView` | `components/coach/CoachView.tsx` | Root coach layout |
| `ChatThread` | `components/coach/ChatThread.tsx` | Scrollable message thread with scroll-lock auto-scroll |
| `CoachMessage` | `components/coach/CoachMessage.tsx` | Single assistant message bubble |
| `FounderMessage` | `components/coach/FounderMessage.tsx` | Single user message bubble |
| `CoachInput` | `components/coach/CoachInput.tsx` | Textarea + send button |
| `CoachTypingIndicator` | `components/coach/CoachTypingIndicator.tsx` | Animated "..." while streaming |
| `ContextSummaryBanner` | `components/coach/ContextSummaryBanner.tsx` | Shown after compaction (subtle notice) |
| `ChatThreadSkeleton` | `components/coach/ChatThreadSkeleton.tsx` | Loading skeleton while history fetches on mount |

### API Routes
| Route | Method | Purpose |
|---|---|---|
| `/api/coach` | POST | Invoke Coach Agent (raw SSE stream — same pattern as `/api/debrief`) |
| `/api/coach/messages` | GET | Load coach history + `coach_opening_prompts` — `?session_id=&debrief_id=` |

---

## Coach Agent Architecture

**Model**: `gemini-2.5-flash`
**Framework**: `@iqai/adk` v0.8.5 (`LlmAgent`, `FunctionTool`, `InMemorySessionService`, `Runner`)
**Pattern**: Stateless-per-request — full `coach_messages` history rebuilt from Supabase on every POST
**Session service**: `InMemorySessionService` (only option in `@iqai/adk`)

### Why stateless-per-request
`@iqai/adk` only ships `InMemorySessionService` — there is no `DatabaseSessionService` in the TypeScript package. Storing ADK session state in memory is safe only on a single instance; Cloud Run scales horizontally. Solution: treat every `/api/coach` POST as a fresh ADK session, but prime the agent's context with:
1. All session artifacts fetched from Supabase (brief, transcript, Q&A turns, debrief output)
2. Full `coach_messages` history for the active `debrief_id` (oldest → newest)

This mirrors how the Debrief agent already works in Phase 5.

### Coach Opening Message
On the coach's first appearance (no messages in `coach_messages` for this `debrief_id`), the route generates a context-aware opener **before** the founder types anything:
- Client calls `POST /api/coach` with `{ session_id, message: '__init__' }` (internal sentinel)
- Agent reads debrief output and produces: "I've read your debrief. Your biggest gap is [lowest axis] at [score]/10 — [top_concern]. Where do you want to start?"
- This opener is saved to `coach_messages` as `role='coach'` and displayed as the first message
- Founder then types their first real message

### Context Management (Manual — TokenBasedContextCompactor not in adk-js)
`TokenBasedContextCompactor` is Python/Go only.

Manual fallback in the `/api/coach` route handler:
- Count message rows in `coach_messages` for the active `debrief_id` (excluding `is_summary = true` rows from count)
- When row count exceeds **20 pairs** (40 rows, ~8,000 tokens estimated):
  1. Fetch the oldest 10 pairs (20 rows) from `coach_messages` that are not summaries
  2. Call `gemini-2.5-flash` (single stateless call): "Summarize this coaching conversation history in 150 words, preserving key decisions and advice given."
  3. Delete those 20 rows from `coach_messages`
  4. Insert a single `role='coach'`, `is_summary=true` row with the summary text and the next available `sequence_number`
- Build the history array passed to the agent: fetch all rows ORDER BY sequence_number, place the summary first with a `[CONVERSATION SUMMARY]` prefix
- Show `ContextSummaryBanner` when any `is_summary = true` row exists in the loaded history

### Context Caching
Not available in `@iqai/adk`. Mitigation: all session artifacts are fetched once in the `/api/coach` route handler at request start and injected into the agent's system prompt. No re-fetching mid-stream.

### Direct Supabase Tools (no MCP Toolbox)
Same pattern as Debrief — `FunctionTool` wrappers over direct Supabase queries:

| Tool | Returns |
|---|---|
| `get_project_brief` | `project_briefs.extracted_summary` |
| `get_hackathon_brief` | `hackathon_briefs.extracted_summary` |
| `get_pitch_transcript` | `pitch_recordings.transcript` |
| `get_qa_turns` | all `qa_turns` for the session's active `qa_session` |
| `get_debrief_output` | `debriefs.output` for the active debrief |
| `get_coach_history` | all `coach_messages` for `debrief_id` (ordered by `sequence_number`) |

---

## Coach Persona and Tone

The Coach is a post-mortem advisor — direct, evidence-based, and prescriptive. It does not re-state the debrief. It uses specific quotes from the session as evidence. It tells the founder exactly what to change and how.

Persona guidelines (in system prompt):
- Reference specific moments: "When the VC judge asked about market size, you said..."
- Prescriptive: "Your answer to X should be reframed as..."
- Grounded in the fracture map: "Your lowest score was User Advocate at 4/10. Here's why that happened..."
- Not encouraging for the sake of being encouraging — honest about real gaps

---

## Conversation Persistence

- Every message (user + assistant) is written to `coach_messages` immediately after the relevant event
- User message: written optimistically on submit (before stream starts)
- Coach message: written after stream completes (full content available)
- Summary message: `is_summary = true`, replaces compacted rows, uses real `sequence_number`
- On component mount: `GET /api/coach/messages?session_id=&debrief_id=` returns history + `coach_opening_prompts`
- If user returns to coach: full conversation history is restored from Supabase
- Coach opening message (`__init__` turn): written as first row (`role='coach'`, `sequence_number=0`) — not re-generated on return visits (already in history)

---

## Session Completion

- First **founder** message sent → `sessions.state = 'completed'` (the `__init__` coach opener does NOT count)
- State does not regress — once `completed`, stays `completed`
- User can always return to coach and continue the conversation after completion

---

## Phase 5 Patch Required (prerequisite)

`coach_opening_prompts` must be written by `/api/debrief` POST at stream completion. Currently missing. Add to the debrief route's success block (after `update({ output, status: 'complete' })`):

```typescript
// Generate coach_opening_prompts from debrief output (no extra LLM)
function generateCoachOpeningPrompts(output: DebriefOutput): string[] {
  // Sort fracture axes by score ascending → two lowest
  const axes = [
    { key: 'vc', score: output.fracture_map.vc.score, concern: output.fracture_map.vc.top_concern },
    { key: 'domain_expert', score: output.fracture_map.domain_expert.score, concern: output.fracture_map.domain_expert.top_concern },
    { key: 'user_advocate', score: output.fracture_map.user_advocate.score, concern: output.fracture_map.user_advocate.top_concern },
  ].sort((a, b) => a.score - b.score)

  const [lowest, second] = axes
  const vuln = output.qa_vulnerabilities[0]

  return [
    `The ${lowest.key.replace('_', ' ')} flagged: "${lowest.concern}" — how do I fix this?`,
    `The ${second.key.replace('_', ' ')} flagged: "${second.concern}" — what's the root cause?`,
    vuln ? `What went wrong when the judge asked about "${vuln.title}"?` : `How do I strengthen my overall narrative?`,
  ]
}

await supabase
  .from('debriefs')
  .update({ coach_opening_prompts: generateCoachOpeningPrompts(output) })
  .eq('id', debriefId)
```

Also: add `coach_opening_prompts` to the `GET /api/debrief` selected columns so the coach page can read them on mount.

---

## DB Migration Required

Add `is_summary` column to `coach_messages` (new migration file `003_coach_summary.sql`):

```sql
ALTER TABLE coach_messages ADD COLUMN is_summary boolean NOT NULL DEFAULT false;
```

This replaces the broken `sequence_number = -1` sentinel approach.

---

## Dependencies
- Supabase: `coach_messages` (with `is_summary` column), `sessions`, `debriefs`
- `@iqai/adk` v0.8.5: `LlmAgent`, `FunctionTool`, `InMemorySessionService`, `Runner`
- `GOOGLE_API_KEY`: Gemini (`gemini-2.5-flash`) — same key as Debrief agent
- Migration `003_coach_summary.sql`
- Phase 5 patch: `coach_opening_prompts` write in `/api/debrief`
