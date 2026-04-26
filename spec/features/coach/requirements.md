# Requirements: coach

## Functional Requirements

### FR-COACH-00: Phase 5 Patch — `coach_opening_prompts`
- `/api/debrief` POST must write `coach_opening_prompts` to `debriefs` after stream completes
- Generation is deterministic, no extra LLM: sort fracture axes by score ascending, use `top_concern` text
- Prompt format: `"The [axis] flagged: \"[top_concern]\" — how do I fix this?"` (axis 1 & 2), `"What went wrong when the judge asked about \"[qa_vulnerability.title]\"?"` (3rd, or fallback)
- `GET /api/debrief` must include `coach_opening_prompts` in selected columns
- This is a prerequisite for FR-COACH-01. Must be implemented before Phase 6.

### FR-COACH-01: Mount — Coach Opening and History
- On mount of coach sub-view: call `GET /api/coach/messages?session_id=&debrief_id=`
- While fetching: show `ChatThreadSkeleton` (loading state, not blank)
- If no messages exist for this `debrief_id`:
  - Call `POST /api/coach` with `{ session_id, message: '__init__' }` (internal sentinel)
  - Coach agent reads the debrief and produces a context-aware opener: "I've read your debrief. Your biggest gap is [lowest axis] at [score]/10 — [top_concern]. Where do you want to start?"
  - Opener saved to `coach_messages` (`role='coach'`, `sequence_number=0`)
  - Opener displayed as first message in `ChatThread`
  - Show 3 `coach_opening_prompts` chips below the opener
- If messages exist (returning visit): render full history, no opener re-generation, no chips

### FR-COACH-02: Sending a Message
- Founder types in `CoachInput` textarea (Enter to submit, Shift+Enter for newline)
- On submit:
  - Append `FounderMessage` to `ChatThread` immediately (optimistic)
  - Write founder message to `coach_messages` immediately (role='founder')
  - Disable `CoachInput` while response is streaming
  - `POST /api/coach` with `{ session_id, debrief_id, message }`
  - Response streams via raw SSE (same event format as `/api/debrief`), renders into `CoachMessage`
- First **founder** message sent → `sessions.state = 'completed'` (opener does not count)
- Chips (if visible) fade out on first founder message send

### FR-COACH-03: Streaming Coach Response
- Coach response streams via SSE `TEXT_MESSAGE_CONTENT` delta events into `CoachMessage`
- `CoachTypingIndicator` visible from send until first `TEXT_MESSAGE_CONTENT` event arrives
- Auto-scroll: only auto-scroll when user is within 100px of bottom of `ChatThread` (scroll-lock pattern — do not override intentional scroll-up)
- On stream complete (`RUN_FINISHED` event): write full assistant response to `coach_messages`, re-enable `CoachInput`

### FR-COACH-04: Message Persistence
- Founder message: written to `coach_messages` on optimistic send (`role='founder'`, `sequence_number` = next available for `debrief_id`)
- Coach response: written to `coach_messages` on stream complete (`role='coach'`, `sequence_number` = next available)
- Summary rows: `is_summary = true`, real `sequence_number` (NOT -1)
- On return: load messages `WHERE debrief_id = [active debrief id]` ORDER BY sequence_number
- After a re-run debrief: new `debrief_id` → fresh conversation. Opener is generated again for the new debrief

### FR-COACH-05: Context Compaction Notice
- When compaction fires (manual 20-pair threshold in route handler):
  - `ContextSummaryBanner` appears above the input: "Earlier parts of the conversation have been summarized to keep context focused."
  - Informational only — conversation continues seamlessly
- Banner shown whenever any `is_summary = true` row exists in the loaded history

### FR-COACH-06: Returning to Coach
- Session `completed` → coach sub-view fully functional, all history loaded
- After re-run debrief: new `debrief_id` → coach shows fresh opener (correct, not a bug)
- `CoachInput` always available

### FR-COACH-07: Suggested Prompts
- Chips shown only on first coach visit (when only the opener exists in history, no founder messages yet)
- 3 chips sourced from `debriefs.coach_opening_prompts` (specific to this session)
- Fallback if `coach_opening_prompts` is null: ["What should I focus on most before demo day?", "Which judge concern was most serious?", "How do I improve my overall score?"]
- Clicking a chip populates `CoachInput` textarea — does NOT auto-submit
- Chips fade out (CSS opacity transition) when first founder message is sent

---

## Non-Functional Requirements

### NFR-COACH-01: Response Quality
- Agent has full session context injected at request start (brief, transcript, Q&A turns, debrief output)
- Responses must reference specific evidence from the session
- Opening message must name the lowest-scoring axis and its `top_concern`
- Agent must not invent evidence — only cite what exists in Supabase

### NFR-COACH-02: Context Compaction Safety
- Compaction threshold: 20 pairs (40 rows in `coach_messages`, excluding summaries)
- Compaction must preserve: debrief output (always in system prompt), most recent 3 exchange pairs, plus the summary
- Summary stored with `is_summary = true` and a real `sequence_number` — NOT `sequence_number = -1`
- Second compaction on same `debrief_id`: inserts a second `is_summary = true` row with the next sequence number (two summaries is valid)

### NFR-COACH-03: Streaming Compatibility
- `Transfer-Encoding: chunked`, `Cache-Control: no-cache`, `Content-Type: text/event-stream` required
- Same Cloud Run streaming setup as `/api/debrief`

### NFR-COACH-04: No Coach Without Debrief
- Coach sub-view only accessible when state ≥ `debrief_ready`
- If user reaches coach URL directly without debrief: redirect to `/session/[id]/debrief/review`
- Guard runs in the page component (check `sessionState` from Zustand + `useRouter`)

### NFR-COACH-05: Message Length
- User messages: max 2,000 characters (validated client-side AND in Zod schema on route)
- Show character counter in CoachInput when > 1,500 characters remaining

### NFR-COACH-06: `__init__` Sentinel Security
- `POST /api/coach` must validate that `message === '__init__'` is only accepted when `coach_messages` has zero rows for the given `debrief_id`
- If rows already exist and `__init__` is sent, return 422 to prevent duplicate openers

---

## Acceptance Criteria

- [ ] Phase 5 patch: `coach_opening_prompts` written by debrief route
- [ ] Phase 5 patch: `GET /api/debrief` returns `coach_opening_prompts`
- [ ] Migration 003: `is_summary` column added to `coach_messages`
- [ ] Coach mount shows skeleton while history loads
- [ ] Coach sends context-aware opener on first visit (names lowest axis + score + concern)
- [ ] Opener saved to `coach_messages` (`sequence_number=0`)
- [ ] 3 session-specific prompt chips shown below opener
- [ ] Clicking a chip populates input (does not auto-submit)
- [ ] Chips fade out on first founder message
- [ ] Founder message appears immediately (optimistic) on submit
- [ ] Founder message written to DB on optimistic send
- [ ] CoachTypingIndicator visible before first SSE token
- [ ] Response streams via SSE into CoachMessage
- [ ] Auto-scroll only fires when within 100px of bottom
- [ ] After stream: input re-enabled, assistant message written to DB
- [ ] First founder message transitions session to `completed`
- [ ] Returning to coach view restores full history (opener + all turns)
- [ ] ContextSummaryBanner shown when `is_summary = true` row in history
- [ ] Compaction uses real sequence_number, not -1
- [ ] Second compaction doesn't conflict in DB
- [ ] Messages > 2,000 chars blocked with validation error
- [ ] `__init__` blocked if messages already exist (NFR-COACH-06)
- [ ] Navigating to coach without debrief redirects to review
