# Requirements: debrief

## Functional Requirements

### FR-DEBRIEF-01: Pre-Debrief State
- When session state is `qa_completed` and no active debrief exists: render `DebriefTriggerCard`
- Card content: title **"Your Debrief is Ready"**, followed by a data-driven tension line:
  > **"3 judges. [X] questions. Here's what they found."**
  (X = total `qa_turns` count for this session, fetched via `useDebriefQuery` on mount)
- Subtext: *"Get your fracture map — where your pitch held and where it cracked."*
- Single CTA: "Get Debrief" (black pill button)

### FR-DEBRIEF-02: Debrief Invocation
- "Get Debrief" → `POST /api/debrief` with `{ session_id }`
- API resolves the active `qa_session_id` (most recent qa_session with `status = 'ended'` for this session) and records it on the new `debriefs` row at creation time — this makes the `get_qa_turns` MCP tool call deterministic
- Response is an AG-UI SSE stream emitting `STATE_DELTA` events per completed section
- CopilotKit `useCoAgent` subscribes to state deltas; `useCoAgentStateRender` renders each section reactively (see `feature-plan.md` — AG-UI Streaming Integration)
- `DebriefTriggerCard` hides; `DebriefStreamingView` renders immediately

### FR-DEBRIEF-02b: Client-Side Abort Timeout
- Client starts an `AbortController` when "Get Debrief" is clicked
- After **90 seconds** without `RUN_FINISHED`, abort the fetch and display:
  **"Debrief is taking too long. Your session may have been saved — try returning."**
- If `debrief_progress` JSONB has any content: show a **"Show partial results"** link that renders whatever was saved to Supabase
- Log the timeout on the client for debugging

### FR-DEBRIEF-03: Streaming Render
- Each section of `DebriefOutput` streams in progressively:
  1. Verdict text streams into `VerdictCard` (text streams word-by-word)
  2. Fracture map scores appear as they arrive (bars animate from 0 to score)
  3. Strengths list items appear one by one
  4. Weaknesses list items appear one by one
  5. Narrative issues appear
  6. Delivery issues appear
  7. Q&A vulnerabilities appear
  8. Next drill appears last
- While streaming: CTA is hidden
- After stream complete: CTA appears as "Talk to Coach"

### FR-DEBRIEF-03b: Pre-warm Context Cache on Mount
- On mount of debrief review sub-view (when `DebriefTriggerCard` is visible), fire a background prefetch:
  - `POST /api/debrief/warm` with `{ session_id }` — calls MCP Toolbox tools (get_project_brief, get_pitch_transcript, get_qa_turns) to warm the ADK ContextCacheConfig cache
  - No UI indication — fully transparent to user
  - This runs while founder reads the trigger card
- When founder clicks "Get Debrief", agent starts with hot cache → first token latency target of < 3s is reliable

### FR-DEBRIEF-04: Fracture Map — Cinematic Reveal
- `FractureMap`: 3 rows, one per persona (VC, Domain Expert, User Advocate)
- Each row: persona name (left) + score bar (center) + score number (right)
- Below each bar: `top_concern` text in secondary color
- Overall score: large display number + circular gauge, centered above the 3 rows
- Score color coding: 0-3 red, 4-5 amber, 6-7 yellow, 8-10 green
- **Reveal sequence** (Framer Motion `staggerChildren`):
  1. Overall score appears first — number counts up, circular gauge fills (tension moment)
  2. 400ms hold
  3. VC axis bar animates in, fills to score
  4. 400ms delay → Domain Expert axis animates in
  5. 400ms delay → User Advocate axis animates in
  6. Any score ≤ 3: bar fills to red with a subtle pulse animation (3 pulses, then rests)
- This reveal order is intentional — overall verdict first, then individual breakdown

### FR-DEBRIEF-04b: Fracture Axis Hover → Evidence Tooltip
- Hovering a fracture axis bar opens a shadcn/ui Tooltip
- Tooltip content: the most relevant `qa_vulnerability` evidence quote for that persona:
  - VC axis → first `qa_vulnerabilities` item where `persona === 'vc'`
  - Domain Expert → first item where `persona === 'domain_expert'`
  - User Advocate → first item where `persona === 'user_advocate'`
  - Fallback: first `qa_vulnerabilities` item if no persona-tagged item exists for that axis
  (Enabled by `Issue.persona` field — see schema in `feature-plan.md`)
- Tooltip format: blockquote styled evidence text (specific moment from session)
- Zero additional agent calls — data already exists in `DebriefOutput`

### FR-DEBRIEF-04c: Section Navigation
- `DebriefSectionNav`: sticky horizontal pill nav rendered at the top of `DebriefStreamingView`
- Pills: **Verdict · Fracture Map · Strengths · Weaknesses · Issues · Next Drill**
- Each pill scrolls its section into view on click
- Pills are **disabled** (greyed, `pointer-events-none`) until their section’s state delta has arrived
- Active section pill is black (filled); inactive loaded pills are `#f1f1f5` — consistent with design system
- Nav stays visible on scroll (sticky `top-0 z-10 bg-[#f9f9ff]`)

### FR-DEBRIEF-05: Findings Lists
- `FindingsList` with `type=strengths`: renders up to 5 strengths with title + explanation
- `FindingsList` with `type=weaknesses`: renders up to 5 weaknesses with title + explanation
- Each item is a card with distinct icon: ✓ for strengths, △ for weaknesses

### FR-DEBRIEF-05b: Empty States
- Every section **must always render** — never show a blank or missing section
- `strengths` empty → card: *"No clear strengths identified in this session."*
- `weaknesses` empty → card: *"No major weaknesses identified — review the issues sections below."*
- `qa_vulnerabilities` empty → *"No Q&A vulnerabilities — judges didn't surface questions. Consider this a session gap."*
- `narrative_issues` empty → *"No narrative issues identified."*
- `delivery_issues` empty → *"No delivery issues identified."*
- Empty state cards use the same card shell as populated items, with muted text color

### FR-DEBRIEF-06: Issues Lists
- Three `IssuesList` sections: Narrative Issues, Delivery Issues, Q&A Vulnerabilities
- Each issue card: title + evidence quote (styled as blockquote) + recommendation
- Evidence quotes reference specific moments from the session

### FR-DEBRIEF-07: Next Drill
- `NextDrillCard`: single prominent card at the bottom of the debrief
- Styled distinctly (e.g. black background, white text) — the most important action item
- Content: `next_drill` string from `DebriefOutput`

### FR-DEBRIEF-08: Debrief Persistence — Incremental Write-Through
- As each section of `DebriefOutput` arrives in the stream, write it incrementally to `debriefs.debrief_progress` JSONB column:
  ```json
  { "verdict": "...", "fracture_map": {...}, "strengths": [...] }
  ```
  Fields are added as they stream — the JSONB object grows progressively
- After stream completes: copy `debrief_progress` to `debriefs.output` (the single complete `DebriefOutput` JSONB), set `status = 'complete'`
- `output` is the canonical field. Never split DebriefOutput into scalar columns — query as `output->>'verdict'`, `output->'fracture_map'`, etc.
- Session state transitions to `debrief_ready` only after `status = 'complete'`
- **Recovery behavior**: On mount, if `is_active = true` but `status != 'complete'`, render whatever sections exist in `debrief_progress` with a prominent amber banner:\n  > **\"Debrief was interrupted \u2014 re-run to complete\"** + "Re-run Debrief" CTA (black pill)\n  Show all available sections (even if partial) so the founder sees what was captured. Do not show a blank screen.
- On return when `status = 'complete'`: render full debrief from final columns, no re-invocation
- CTA on return: "Talk to Coach"

### FR-DEBRIEF-09: Re-run Debrief
- "Re-run Debrief" secondary button available after debrief renders
- Clicking opens a **confirmation modal** before proceeding:
  - Title: **"Start a fresh debrief?"**
  - Body: *"Your previous debrief and coach conversation will be archived. The new debrief starts clean."*
  - CTAs: "Re-run" (black pill) + "Cancel" (ghost button)
- Creates new `debriefs` record (`attempt_number` incremented), marks previous `is_active = false`
- Coach messages scoped to the old `debrief_id` are preserved in DB but **not loaded** in the new coach session (new `debrief_id` → clean history)
- Same streaming flow as first run
- Appropriate for cases where founder re-recorded pitch or wants a second opinion

### FR-DEBRIEF-10: All 3 Axes Populated
- Hard requirement: debrief must not be rendered if `fracture_map` has any null/undefined scores
- If agent returns incomplete fracture map: show error "Debrief incomplete. Try running again."
- This is a demo day demo success criterion

---

## Non-Functional Requirements

### NFR-DEBRIEF-01: Streaming Latency
- First content visible within 3 seconds of "Get Debrief" click
- Full debrief stream typically completes in 15-30 seconds

### NFR-DEBRIEF-02: Cloud Run Streaming
- API route must set `Transfer-Encoding: chunked` header on the SSE response
- No response buffering — chunks must flush immediately
- This is a known requirement for Cloud Run + ADK SSE compatibility

### NFR-DEBRIEF-03: Context Freshness
- `ContextCacheConfig` is Python/Go only — **not available in adk-js**. Do not use it.
- Context strategy: MCP Toolbox tools fetch all session artifacts once at the start of each agent invocation
- `/api/debrief/warm` pre-fetches on `DebriefTriggerCard` mount so data is in Supabase’s hot path before the agent fires
- Target: MCP tool calls resolve in < 500ms (Supabase hot path); combined with pre-warm, first token latency target of < 3s is reliable

### NFR-DEBRIEF-04: Debrief Completeness
- Agent system prompt must enforce that all DebriefOutput fields are populated
- `next_drill` must always be a single actionable sentence (not a list)
- `fracture_map.overall_score` must be 0-10 (integer or one decimal)

---

## Acceptance Criteria

- [ ] "Get Debrief" CTA visible when state is `qa_completed` and no active debrief
- [ ] Trigger card shows: "3 judges. [X] questions. Here’s what they found." with correct turn count
- [ ] Streaming begins within 3 seconds of click
- [ ] VerdictCard renders with streaming text
- [ ] FractureMap shows all 3 axes with scores and top_concern
- [ ] Fracture bar animation: animates from 0 to score on first render
- [ ] Score color coding applied correctly: 0-3 red, 4-5 amber, 6-7 yellow, 8-10 green
- [ ] Score labels are frontend-derived via `scoreToLabel()` — not from agent output
- [ ] Fracture axis hover tooltip shows persona-tagged evidence from `qa_vulnerabilities`
- [ ] `DebriefSectionNav` visible and sticky; pills disabled until section state arrives
- [ ] Strengths and Weaknesses lists render with correct icons (✓ / △)
- [ ] Empty strengths/weaknesses/issues sections render empty state copy (never blank)
- [ ] All 3 issue sections rendered with evidence quotes
- [ ] Issues include `persona` field where available (drives tooltip routing)
- [ ] NextDrillCard renders with distinctive styling (black bg, white text)
- [ ] After stream: "Talk to Coach" CTA appears, session state = `debrief_ready`
- [ ] Returning to debrief view shows persisted debrief (no re-invocation)
- [ ] Interrupted debrief shows recovery banner: "Debrief was interrupted — re-run to complete"
- [ ] 90s client abort fires with correct user message + "Show partial results" if progress exists
- [ ] Re-run clicks open confirmation modal with coach history archive warning
- [ ] Re-run creates new attempt, marks old as inactive
- [ ] Incomplete fracture map shows error state, not partial render
- [ ] DB: `UNIQUE INDEX idx_debriefs_session_active` prevents duplicate active rows
