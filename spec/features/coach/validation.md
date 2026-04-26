# Validation: coach

## Pre-Phase-6 Checklist (run before building Coach)

- [ ] `/api/debrief` POST writes `coach_opening_prompts` to `debriefs` on completion
- [ ] `GET /api/debrief` returns `coach_opening_prompts` in response
- [ ] Migration `003_coach_summary.sql` applied: `is_summary boolean NOT NULL DEFAULT false` on `coach_messages`
- [ ] Verify `debriefs` has an active row with `coach_opening_prompts` non-null before testing

## How to Verify

### Manual Test Cases

#### TC-COACH-00: Phase 5 Patch — Opening Prompts Written
1. Complete a full debrief (Q&A → debrief stream)
2. Check Supabase: `SELECT coach_opening_prompts FROM debriefs WHERE is_active = true AND session_id = '...'`
3. **Expected**: non-null JSONB array with 3 strings, each referencing actual `top_concern` text from the fracture map
4. Also verify: `GET /api/debrief?session_id=...` response JSON contains `coach_opening_prompts`

#### TC-COACH-01: Mount — First Visit, Coach Opens Conversation
1. Ensure session state is `debrief_ready`, no `coach_messages` rows for active `debrief_id`
2. Navigate to `/session/[id]/debrief/coach`
3. **Expected**: `ChatThreadSkeleton` briefly visible while fetching history
4. **Expected**: `__init__` POST fires, coach opener streams in naming the lowest fracture axis, score, and `top_concern`
5. **Expected**: Opener saved to DB as `role='coach', sequence_number=0, is_summary=false`
6. **Expected**: 3 chip prompts visible below opener (session-specific text, not generic)

#### TC-COACH-02: Suggested Prompt Click
1. Click a chip (e.g. "The VC flagged: 'no defensible moat' — how do I fix this?")
2. **Expected**: Text populates `CoachInput` but does NOT auto-submit
3. Verify message is editable before sending
4. **Expected**: Chips still visible

#### TC-COACH-03: First Founder Message
1. Type "How did I do overall?" and press Enter
2. **Expected**: FounderMessage appears immediately (optimistic)
3. **Expected**: Message written to `coach_messages` before stream starts
4. **Expected**: CoachTypingIndicator visible until first SSE delta
5. **Expected**: CoachMessage streams in
6. **Expected**: Input re-enabled after `RUN_FINISHED`
7. **Expected**: Chips fade out
8. **Expected**: Session state = `completed`

#### TC-COACH-04: Evidence Reference in Response
1. Ask "What went wrong in the Q&A?"
2. **Expected**: Coach response quotes a specific judge question and the founder's answer
3. **Expected**: No generic advice without session-specific grounding
4. **Expected**: Response references the fracture map axes by name and score

#### TC-COACH-05: Scroll-Lock Auto-Scroll
1. Send a message, then immediately scroll up in `ChatThread`
2. **Expected**: Thread does NOT auto-scroll back to bottom while user is scrolled up
3. Scroll to bottom manually
4. Send another message
5. **Expected**: Thread auto-scrolls as response streams in (user was already at bottom)

#### TC-COACH-06: Multi-turn Conversation
1. Send 5+ messages back and forth
2. **Expected**: Conversation history maintained, previous messages visible
3. **Expected**: Coach responses are context-aware (references earlier turns)

#### TC-COACH-07: Return to Coach with History
1. Complete 3 exchange pairs
2. Navigate away to Brief
3. Navigate back to Coach
4. **Expected**: Full history visible (opener + 3 pairs), correct order
5. **Expected**: No chips visible (chips only show on first visit)
6. **Expected**: Input available for new messages
7. **Expected**: No duplicate opener generated

#### TC-COACH-08: Context Compaction
1. In dev environment: temporarily lower threshold to 3 pairs (6 rows) to force early compaction
2. Send 3+ exchanges
3. **Expected**: `ContextSummaryBanner` appears
4. **Expected**: Supabase has an `is_summary = true` row with a real `sequence_number`
5. **Expected**: Conversation continues, coach retains context of key points
6. Run again to trigger second compaction
7. **Expected**: Second `is_summary = true` row inserted without conflict (no unique constraint violation)

#### TC-COACH-09: Coach Blocked Without Debrief
1. Manually navigate to `/session/[id]/debrief/coach` when state is `qa_completed`
2. **Expected**: Redirect to `/session/[id]/debrief/review`

#### TC-COACH-10: Long Message Validation
1. Type 1,501 characters in CoachInput
2. **Expected**: Character counter appears (`499 remaining` style)
3. Type to 2,001 characters
4. Attempt to send
5. **Expected**: Client-side validation error, no submission, counter turns red

#### TC-COACH-11: `__init__` Duplicate Guard
1. Manually call `POST /api/coach { session_id, message: '__init__' }` when messages already exist
2. **Expected**: 422 response with `INVALID_STATE` code

---

## API Contract Tests

### POST /api/coach — First message
```
Request: { "session_id": "...", "debrief_id": "...", "message": "How did I do?" }
Response: SSE stream

Events (in order):
  { type: 'RUN_STARTED', threadId, runId }
  { type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' }
  { type: 'TEXT_MESSAGE_CONTENT', messageId, delta: '...' }  ← multiple
  { type: 'TEXT_MESSAGE_END', messageId }
  { type: 'RUN_FINISHED', threadId, runId }

After exchange, Supabase state:
  coach_messages for debrief_id contains:
    sequence_number=0: role='coach', is_summary=false  ← opener
    sequence_number=1: role='founder', content='How did I do?', is_summary=false
    sequence_number=2: role='coach', content='...full response...', is_summary=false

  sessions.state = 'completed'
```

### POST /api/coach — `__init__` sentinel
```
Request: { "session_id": "...", "debrief_id": "...", "message": "__init__" }
Response (no prior messages): SSE stream → coach opener
Response (messages exist):    422 { error: { code: 'INVALID_STATE', ... } }
```

### GET /api/coach/messages
```
Request: GET /api/coach/messages?session_id=...&debrief_id=...
Response: {
  messages: [
    { id, role, content, sequence_number, is_summary, created_at },
    ...
  ],
  coach_opening_prompts: ["...", "...", "..."] | null
}
```

---

## Database State Validation

After first founder message:
```sql
SELECT state FROM sessions WHERE id = '...';
-- Expected: 'completed'

SELECT role, sequence_number, is_summary, LEFT(content, 60)
FROM coach_messages WHERE debrief_id = '...'
ORDER BY sequence_number;
-- Expected: sequence_number 0 (coach opener), 1 (founder), 2 (coach response)

SELECT coach_opening_prompts FROM debriefs WHERE is_active = true AND session_id = '...';
-- Expected: non-null array of 3 strings
```

After compaction:
```sql
SELECT sequence_number, is_summary, LEFT(content, 60)
FROM coach_messages WHERE debrief_id = '...'
ORDER BY sequence_number;
-- Expected: one row with is_summary = true, real sequence_number (not -1)
-- Expected: fewer total rows than before compaction
```

---

## Streaming Header Validation (Cloud Run)
```bash
curl -N -X POST https://[SERVICE_URL]/api/coach \
  -H "Content-Type: application/json" \
  -d '{"session_id": "...", "message": "hello"}' \
  -v 2>&1 | grep -i "transfer-encoding"
# Expected: Transfer-Encoding: chunked
```

---

## Edge Cases

| Scenario | Expected Behavior |
|---|---|
| User presses Enter on empty input | No submission, no API call |
| Network drops mid-response stream | Partial response shown, input re-enabled, user can retry |
| Coach returns very long response (> 1,000 words) | Full response rendered, auto-scroll keeps up |
| User sends same message twice rapidly | Second submit blocked while first is in-flight |
| Coach session reaches 8,000 tokens | Compaction fires transparently, ContextSummaryBanner shown |
| User navigates away mid-stream | Stream abandoned; partial response NOT saved |
| MCP Toolbox tool returns error | Agent handles gracefully, responds with what it has |
| Debrief was re-run; coach needs latest | `get_debrief_output` tool always returns `is_active=true` record |
