# Requirements: qa-room

## Functional Requirements

### FR-QA-01: Pre-Session Setup
- On mount of qa sub-view: check `pitch_recordings.status` for this session
  - If `status = 'processing'`: show blocking state "Preparing your session… waiting for transcript" with spinner; poll every 3s; do not open WebSocket until `status = 'ready'`
  - If `status = 'failed'`: show error "Transcript unavailable. Please re-record your pitch." with CTA back to pitch sub-view
  - If `status = 'ready'`: proceed
- Fetch session context **client-side from Supabase** (before token call, using service key via server action or a dedicated GET route):
  - `project_briefs.extracted_summary` WHERE `session_id` AND `is_active = true`
  - `hackathon_briefs.extracted_summary` WHERE `session_id` AND `is_active = true`
  - `pitch_recordings.transcript` WHERE `session_id` AND `is_active = true`
  - All three required. If any source is null: system prompt notes it; does NOT block session.
- `POST /api/qa/token` with `{ session_id }` → `{ access_token, project, location, model, qa_session_id }`
  - Server uses `google-auth-library` to issue a short-lived Google OAuth access token from the service account (Vertex AI auth pattern — no Gemini ephemeral token API)
  - Server also creates the `qa_sessions` record here (status = `'active'`, `started_at` set on WebSocket `open` callback, `pitch_recording_id` from active `pitch_recordings` row)
  - **Context is NOT returned in this response** — client already has it from the Supabase fetch above
- Render judge intro screen (FR-QA-03b)
  - **AudioContext MUST be created inside the intro-to-live transition click/tap handler** (the user gesture that triggers WebSocket open). Creating AudioContext before any user gesture causes browsers to block playback silently — judges will appear to connect but audio will never play.
- Browser initializes `@google/genai` with `{ vertexai: true, project, location }` using the access token
- `ai.live.connect(...)` opens the WebSocket

### FR-QA-02: Audio Pipeline Setup
- Request mic permission via `navigator.mediaDevices.getUserMedia({ audio: true })`
- Request camera permission via `navigator.mediaDevices.getUserMedia({ video: true })` (separate call from mic)
  - On camera permission denied or device unavailable: `FounderTile` renders founder avatar (initials circle) — never a black box or crash
  - Mic denial is a hard blocker; camera denial is a soft fallback
- Register AudioWorklet processors:
  - `capture-processor.js`: captures mic audio, **resamples from native mic rate (typically 44.1kHz or 48kHz) to 16kHz**, converts to PCM 16-bit mono, outputs 20–40ms chunks to main thread
  - `playback-processor.js`: receives PCM 24kHz chunks, outputs to speaker
- Main thread bridges: mic chunks → WebSocket `sendRealtimeInput({ audio: { data, mimeType: 'audio/pcm;rate=16000' } })`; WebSocket receive → playback processor
- On `server_content.interrupted = true`: immediately stop playback, clear audio queue, deactivate judge `ActiveSpeakerRing`
- On `visibilitychange` (tab regains focus): call `audioContext.resume()` — browsers suspend AudioContext when tab is hidden; without this, audio is permanently frozen after any tab switch
- On mic permission denied: show error "Microphone access required for the Q&A session"

### FR-QA-03: Connection Status
- `ConnectionStatusBanner` shows current WebSocket state:
  - "Connecting..." (yellow) — while establishing
  - "Live" (green, pulsing dot) — connected and active
  - "Reconnecting..." (orange) — reconnect attempt in progress
  - "Connection lost" (red) — after max retries exhausted
- Banner is non-blocking (renders above the room layout)

### FR-QA-03b: Judge Persona Intro Screen
- Render before WebSocket opens (after transcript guard passes and token is issued)
- Staggered Framer Motion reveal: 3 judge tiles animate in with 400ms between each
- Each tile: judge avatar placeholder, name, archetype title, 1-sentence description
- After all 3 tiles visible: 1-second hold → room transitions to live (WebSocket opens, audio starts)
- No skip button — this is intentional emotional framing (3 seconds total)

### FR-QA-03c: Live Judge Subtitle
- While a judge is speaking: render their current text output as a 1-line ticker at the bottom of their tile
- Text clears when `turn_complete` fires
- Only judge text — no founder speech subtitle
- Handles partial streaming: update substring on each text delta event

### FR-QA-04: Session Flow
- On WebSocket `open`: 
  1. Set `qa_sessions.started_at = NOW()` (update the record created in FR-QA-01)
  2. Send system prompt via `sendClientContent({ turns: [{ parts: [{ text: systemPrompt }], role: 'user' }], turnComplete: false })`
     **Note**: `initial_history_in_client_content: true` is NOT a real Gemini Live API parameter — do not use it.
  3. System prompt includes: judge personas + YC vertebrae mandate + opening question mandate + founder context block (hackathon brief + project brief + pitch transcript)
  4. Send `SessionResumptionUpdate` config in session setup to receive resumption handles
  5. Send `ContextWindowCompressionConfig` with `slidingWindow: {}` in session setup
  6. Send transcription config: `outputAudioTranscription: {}` and `inputAudioTranscription: {}` in session setup — **required or turn capture produces no text**
- Judges initiate the session with an opening question (no silence waiting for founder)
- Founder speaks → mic audio sent via `sendRealtimeInput`
- Gemini Live responds → audio received → played through speakers
- Turn boundary: `turn_complete` event → `useTurnCapture` fires `POST /api/qa/turn`
- Response end: `generation_complete` event → deactivate judge `ActiveSpeakerRing`, clear subtitle

### FR-QA-05: Active Speaker Indicator
- `ActiveSpeakerRing`: pulsing animated ring (Framer Motion) on the currently speaking tile
- Founder tile: ring active when mic level > threshold (VAD)
- Judge tiles: ring active when playback audio is non-silent
- Only one tile active at a time

### FR-QA-06: Turn Capture
- **Transcription must be enabled in session setup config** (`outputAudioTranscription: {}` and `inputAudioTranscription: {}`)
- Every turn boundary: `POST /api/qa/turn` with:
  ```json
  { "session_id": "...", "qa_session_id": "...", "sequence_number": 0, "speaker": "vc|domain_expert|user_advocate|founder", "content": "...", "timestamp_offset": 12345 }
  ```
- `timestamp_offset` = `Date.now() - qaSessionStartedAt` (ms from session start)
- `content` for judge turns = `server_content.outputTranscription.text` with speaker tag stripped
- `content` for founder turns = `server_content.inputTranscription.text`
- Fire-and-forget: do not block audio pipeline on turn write
- If turn write fails: retry 3x with 500ms delay; if all fail, log and continue (data loss acceptable over latency)
- On End Session: if last turn is in-flight (content received but `turn_complete` not yet fired), wait up to 2 seconds before calling `POST /api/qa/end`

### FR-QA-07: Heartbeat
- `useHeartbeat`: `POST /api/qa/heartbeat` every 30 seconds while session is active
- Payload: `{ "session_id": "...", "qa_session_id": "..." }`
- Used to detect abandoned sessions server-side

### FR-QA-08: Session Resumption (replaces token refresh)
The Live API WebSocket connection resets approximately every 10 minutes. The server sends a `GoAway` message before terminating.

**GoAway handling:**
- Listen for `response.goAway.timeLeft` in the message loop
- When `timeLeft < 3 seconds`: begin reconnect immediately
- Reconnect using the latest saved `resumptionHandle` (from `SessionResumptionUpdate` messages)

**SessionResumptionUpdate handling:**
- On every message: check `response.sessionResumptionUpdate?.newHandle`
- If present and `resumable = true`: save `newHandle` to memory (valid 2 hours)
- On reconnect: pass `sessionResumption: { handle: resumptionHandle }` in session config
- Server preserves full context with the handle — **do NOT re-send system prompt or captured turns when resuming with a valid handle**

**Cold reconnect fallback (no valid handle):**
- Re-send full system prompt + capture all turns from Supabase and re-inject as conversation history

`ConnectionStatusBanner` shows "Reconnecting..." during any reconnect attempt.

> Note: The `POST /api/qa/token/refresh` route is **removed** — no longer needed. The Vertex AI access token is valid ~1 hour; session resumption handles connection resets independently.

### FR-QA-09: Network Reconnect
- On unexpected WebSocket `close` (not user-initiated, not GoAway):
  1. Wait 1s, reconnect with resumption handle (if available)
  2. If still fails: wait 2s, retry with handle
  3. If still fails: wait 4s, reconnect without handle (cold fallback — re-inject context)
  4. If fails after 30s total: show "Connection lost" banner with "Try Again" button
- Re-send system prompt only on cold fallback (no handle)

### FR-QA-12: Interruption Handling
- On `server_content.interrupted = true`:
  1. Stop audio playback immediately
  2. Clear the entire client-side audio queue (do not finish playing buffered audio)
  3. Deactivate judge `ActiveSpeakerRing`
  4. Increment in-memory `interruption_count`
- `interruption_count` is written to `qa_sessions` on `POST /api/qa/end`

### FR-QA-13: Session Length Enforcement
- `SessionTimer` counts up from 00:00
- Thin session progress bar (4px) at top of room: green fill 0–8:00, amber fill 8–15:00
- At **8:00**: pulse timer yellow — visual signal to founders that they are at the target length
- At **12:00**: show non-blocking banner "Session ending in 3 minutes"
- At **15:00**: auto-end session (closing ritual fires, then end — no confirmation modal) — prevents API audio-only session hard limit

### FR-QA-14: Minimum Turn Guard
- If founder clicks "End Session" and `sequence_number < 6` (fewer than 3 exchange pairs):
  - `EndSessionModal` shows additional copy: "You've had X exchanges. Most founders get richer debrief data after 8–10 turns. Continue for better feedback?"
  - Two CTA buttons: "Continue Session" (primary) and "End Anyway" (secondary, destructive styling)
  - If `sequence_number ≥ 6`: standard confirmation modal (no extra copy)

### FR-QA-15: Cold Start UX
- After WebSocket opens and before the first judge audio plays (typically 1–5 seconds): show subtle loading indicator below the judge tiles: "Judges are reviewing your brief..."
- Clear this indicator when the first audio chunk arrives

### FR-QA-10: End Session
- "End Session" button opens `EndSessionModal` with confirmation: "Are you sure? Ending the session will finalize your Q&A."
- "Confirm End Session" → trigger closing ritual → close WebSocket → `POST /api/qa/end` → session state = `qa_completed`

**Closing ritual (required before WebSocket close):**
1. Send `sendClientContent({ turns: [{ parts: [{ text: 'SESSION_ENDING' }], role: 'user' }], turnComplete: true })`
2. Wait for `generation_complete` (judge delivers single closing line: *"Thank you. We'll deliberate."*)
3. Close WebSocket after `generation_complete` fires OR after 4-second timeout
- This is the emotional punchline of the rehearsal. Do not skip.
- At 15:00 auto-end: same ritual, no confirmation modal.

- `qa_sessions.ended_at` and `duration_seconds` set
- Navigate to `/session/[id]/debrief/review` after end
- "Cancel" dismisses modal without ending

### FR-QA-11: Mute
- Mute button toggles mic input (stop sending audio chunks to WebSocket)
- Visual indicator: mic icon with slash when muted
- Judges continue speaking if they were in the middle of a turn; mute takes effect on next founder turn

---

## Non-Functional Requirements

### FR-QA-11b: Circuit Breaker on Turn Writes
- Normal path: fire-and-forget POST per turn, 3 retries
- Degraded path (activated after 3 consecutive turn write failures):
  - Stop individual POSTs
  - Buffer turns in-memory array
  - Flush buffer via a single batch POST every 10 seconds
  - On next successful write: reset to normal incremental path
- The circuit breaker only activates on failure — never used as default behavior
- `ConnectionStatusBanner` adds subtle note "Turn sync degraded" when circuit breaker is active

### NFR-QA-01: Latency
- Audio round-trip target: < 1500ms (Gemini Live typical latency)
- Turn write to Supabase: fire-and-forget, no UI blocking
- Audio chunks: 20–40ms (never buffer > 100ms before sending)

### NFR-QA-02: Data Loss Prevention
- Q&A turns are written incrementally — never batched
- Even if only 2 turns are written before a crash, those 2 turns are preserved
- Heartbeat enables server-side detection of abandoned sessions (no `ended_at` + stale `last_heartbeat_at`)

### NFR-QA-03: No Video Recording of Judges
- Judge tiles show static avatar + name, no video stream
- Founder tile shows founder's camera feed (live, not recorded)

### NFR-QA-04: Session Finalization on Abandoned Sessions
- Server-side Cloud Scheduler job (every 15 min): mark qa_sessions where `last_heartbeat_at < now() - 5 minutes` and `ended_at IS NULL` as `status = 'abandoned'`
- Abandoned sessions: set `sessions.state = 'qa_completed'` anyway to not block debrief

### NFR-QA-05: Context Window Compression
- `ContextWindowCompressionConfig` with `slidingWindow: {}` is **always enabled** in session setup
- Audio tokens accumulate at ~25 tokens/second. 8 min session ≈ 12,000 tokens. 15 min ≈ 22,500 tokens. Both are well within the 128k context limit for native audio models.
- Compression is a safety net to prevent abrupt termination if sessions run long.

---

## Acceptance Criteria

- [ ] WebSocket connection established before UI renders interactive elements
- [ ] ConnectionStatusBanner accurately reflects WebSocket state
- [ ] Audio plays from judges through speakers
- [ ] Mic audio captured and sent to Gemini Live
- [ ] Active speaker ring animates on the correct tile
- [ ] Each turn written to Supabase via /api/qa/turn immediately on turn_complete event
- [ ] Heartbeat fires every 30s
- [ ] Token refresh and reconnect work transparently (no user action required)
- [ ] End Session modal requires confirmation before ending
- [ ] After ending: session state = `qa_completed`, navigated to debrief
- [ ] Mute button stops mic audio being sent (judges don't hear founder when muted)
- [ ] Network drop triggers auto-reconnect with backoff
