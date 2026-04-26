# Validation: qa-room

## How to Verify

### Manual Test Cases

#### TC-QA-01: Full Session Flow
1. Navigate to `/session/[id]/room/qa` (session must be `pitch_recorded`)
2. Grant mic permission when prompted
3. **Expected**: ConnectionStatusBanner shows "Connecting..."
4. **Expected**: After connection: "Live" status with green pulsing dot
5. **Expected**: Judge begins with an opening question (audio plays from speaker)
6. Speak an answer
7. **Expected**: Founder tile shows active speaker ring while speaking
8. **Expected**: Judge tile shows active speaker ring when judge responds
9. After 2-3 turns, click "End Session"
10. **Expected**: EndSessionModal appears
11. Click "Confirm End Session"
12. **Expected**: Redirected to `/session/[id]/debrief/review`
13. **Expected**: Session state = `qa_completed`

#### TC-QA-02: Turn Capture Verification
1. Complete a Q&A session with 3+ turns
2. Query Supabase:
```sql
SELECT sequence_number, speaker, LEFT(content, 50)
FROM qa_turns WHERE qa_session_id = '...'
ORDER BY sequence_number;
```
3. **Expected**: Rows exist for each turn, in order, with correct speaker labels

#### TC-QA-03: Heartbeat Verification
1. Start a Q&A session
2. Wait 35 seconds without speaking
3. Query Supabase:
```sql
SELECT last_heartbeat_at FROM qa_sessions WHERE id = '...';
```
4. **Expected**: `last_heartbeat_at` updated within the last 35 seconds

#### TC-QA-04: Mute Toggle
1. Start session, click Mute button
2. **Expected**: Mic icon shows slash
3. Speak — judges should not respond (no mic input sent)
4. Click Mute again
5. **Expected**: Normal audio resumes

#### TC-QA-05: End Session Modal Dismissal
1. Click "End Session"
2. **Expected**: Modal appears
3. Click "Cancel"
4. **Expected**: Modal closes, session continues
5. Session still active, audio still flowing

#### TC-QA-06: Session Resumption on Connection Reset
1. Start a Q&A session, speak 3 turns
2. Verify in browser console that `SessionResumptionUpdate` messages are arriving and `resumptionHandle` is being saved
3. Simulate connection reset (Chrome DevTools → Network → Offline for 2 seconds, then back Online)
4. **Expected**: `ConnectionStatusBanner` briefly shows "Reconnecting..."
5. **Expected**: Reconnect uses saved `resumptionHandle` (check console log: "Reconnecting with handle: ...")
6. **Expected**: "Live" status returns; judges continue without re-introducing themselves
7. Check Supabase: `qa_turns` sequence numbers are contiguous (no gaps from reconnect)

#### TC-QA-07: Network Drop Recovery
1. Start session, disconnect network for 5 seconds, reconnect
2. **Expected**: `ConnectionStatusBanner` shows "Reconnecting..."
3. **Expected**: After reconnect, "Live" status returns
4. **Expected**: If resumptionHandle was available: judges continue from where they left off
5. **Expected**: If no handle (cold fallback): judges briefly re-establish context before next question

#### TC-QA-11: Judge Context Grounding — Opening Question
1. Complete brief with a specific claim (e.g., "500 daily active users from beta")
2. Start Q&A session
3. **Expected**: First judge question directly targets that specific claim (e.g., "Your transcript mentions 500 DAUs — how were those acquired?")
4. **Expected**: First question is NOT a generic opener like "Tell us about your product"
5. If opening is generic: system prompt is missing the opening question mandate — check FR-QA-04

#### TC-QA-12: Closing Ritual
1. Run a Q&A session with 4+ turns
2. Click "End Session" → "Confirm End Session"
3. **Expected**: Before navigation, judge audio plays one final line (e.g., "Thank you. We'll deliberate.")
4. **Expected**: Navigation to debrief happens AFTER the closing audio completes (or 4s timeout)
5. **Expected**: Closing turn is NOT written to `qa_turns` (it is an internal session artifact, not a scored turn)

#### TC-QA-13: AudioContext Autoplay Gate
1. Navigate to the Q&A room
2. Observe the judge intro screen (3-second stagger animation)
3. Do NOT click anything during the animation
4. **Expected**: No AudioContext created yet; no autoplay policy warnings in console
5. Transition to live room (animation completes or button click)
6. **Expected**: AudioContext created inside click/transition handler; audio plays immediately

#### TC-QA-14: Camera Permission Denied Fallback
1. Navigate to Q&A room with camera blocked in browser settings
2. **Expected**: FounderTile renders an avatar (initials in a circle) — not a black box, not an error crash
3. **Expected**: Mic still works; session proceeds normally
4. **Expected**: No console errors from `getUserMedia` (permission error is caught and handled gracefully)

#### TC-QA-15: Tab Visibility AudioContext Resume
1. Start Q&A session; judge is mid-speech
2. Switch to another browser tab
3. Return to the Q&A tab within 5 seconds
4. **Expected**: Judge audio resumes within 1 second of returning to the tab
5. **Expected**: No manual action required from founder to restore audio — Specific References
1. Complete brief + pitch for a session with specific project details (e.g., "a mobile app for urban farmers")
2. Start Q&A session
3. **Expected**: At least one judge question in the first 3 turns explicitly references the project (e.g., "Your pitch mentioned urban farmers — how large is that addressable market?")
4. **Expected**: No judge asks a generic question that could apply to any startup (e.g., "What does your company do?") — they already know from the transcript
5. Verify in Supabase that `qa_sessions.pitch_recording_id` is set (which transcript the judges heard)

#### TC-QA-09: Session Length Enforcement
1. Start a Q&A session
2. At 8:00 elapsed: **Expected**: SessionTimer pulses yellow
3. At 12:00 elapsed: **Expected**: Non-blocking banner appears: "Session ending in 3 minutes"
4. At 15:00 elapsed: **Expected**: Session auto-ends (no confirmation modal); redirected to debrief
5. Verify `qa_sessions.duration_seconds` ≈ 900 (15 min)

#### TC-QA-10: Interruption Handling
1. Start session, wait for a judge to begin speaking (audio playing)
2. Immediately start speaking (interrupt the judge)
3. **Expected**: Judge audio stops mid-sentence (client audio queue cleared)
4. **Expected**: Judge `ActiveSpeakerRing` deactivates immediately
5. **Expected**: Founder `ActiveSpeakerRing` activates
6. After session ends: verify `qa_sessions.interruption_count > 0` in Supabase

---

## API Contract Tests

### POST /api/qa/token
```
Request: { "session_id": "..." }
Expected (200):
{
  "access_token": "ya29.xxx...",      // short-lived Google OAuth token (~1 hour)
  "project": "invertible-tree-490306-j1",
  "location": "global",
  "model": "gemini-3-flash-preview",
  "qa_session_id": "<uuid>"
}
// Note: token is a Google OAuth access token (Vertex AI), NOT a Gemini API ephemeral token
// Note: context (brief, transcript) is NOT returned here — client fetches it from Supabase directly
```

### POST /api/qa/turn
```
Request:
{
  "session_id": "...",
  "qa_session_id": "...",
  "sequence_number": 0,
  "speaker": "vc",
  "content": "What's your user acquisition strategy?",
  "timestamp_offset": 12345
}
Expected (201): { "id": "<uuid>" }
```

### POST /api/qa/heartbeat
```
Request: { "session_id": "...", "qa_session_id": "..." }
Expected (200): { "status": "ok" }
Side effect: qa_sessions.last_heartbeat_at updated to NOW()
```

### POST /api/qa/end
```
Request: { "session_id": "...", "qa_session_id": "...", "interruption_count": 3 }
Expected (200): { "status": "ended", "duration_seconds": 180 }
Side effects:
  - qa_sessions.ended_at = NOW()
  - qa_sessions.duration_seconds calculated
  - qa_sessions.interruption_count = <value from request>
  - qa_sessions.status = 'ended'   ← CHECK constraint: ('active','ended','abandoned') — NOT 'completed'
  - sessions.state = 'qa_completed'
```

---

## Database State After Session End
```sql
SELECT status, ended_at IS NOT NULL, duration_seconds
FROM qa_sessions WHERE id = '...';
-- Expected: status='ended', ended_at populated, duration_seconds > 0

SELECT COUNT(*), MIN(sequence_number), MAX(sequence_number)
FROM qa_turns WHERE qa_session_id = '...';
-- Expected: sequence numbers are contiguous from 0

SELECT state FROM sessions WHERE id = '...';
-- Expected: 'qa_completed'
```

---

## Edge Cases

| Scenario | Expected Behavior |
|---|---|
| User closes tab during Q&A | Heartbeat stops; server marks qa_session abandoned after 5 min; sessions.state set to qa_completed |
| Judge speaks over founder | Audio mixing handled by browser; both can play simultaneously |
| Gemini returns empty text content for a turn | Turn written with `content = ""` — acceptable |
| qa_turn POST fails all 3 retries | Turn lost; log error; session continues uninterrupted |
| User clicks "End Session" during judge's turn | Wait up to 2s for pending turn to flush, then trigger closing ritual, then end |
| `inputAudioTranscription` / `outputAudioTranscription` not set in config | All `server_content.inputTranscription` and `outputTranscription` fields are undefined — turns have empty content. Check session setup config if this occurs. |
| SessionResumptionUpdate never arrives | Cold fallback reconnect (re-inject system prompt + turns from Supabase) — judges may briefly re-establish context |
| Founder ends session with < 6 turns | Warning shown in EndSessionModal: "You've had X exchanges..." with Continue/End Anyway options |
| Session hits 15:00 auto-end while judge is mid-speech | Audio stops, closing ritual fires ("Thank you. We'll deliberate."), session ends |
| Two End Session clicks (double-click) | Idempotent — second call is a no-op if already ended |
| WebSocket never connects (network issue) | Show "Connection failed" banner after 30s; "Try Again" button re-initiates connection |
| Session already has qa_session record (page refresh) | Create new qa_session record for the new WebSocket connection |
| Camera permission denied | FounderTile renders avatar fallback; mic + session proceed normally |
| Tab backgrounded mid-session | AudioContext suspended; on tab return, `visibilitychange` handler calls `audioContext.resume()` |
| `gemini-3-flash-preview` does not support Live API on Vertex AI | Pre-implementation gate must catch this; fallback model `gemini-2.0-flash-live-001` used instead |
