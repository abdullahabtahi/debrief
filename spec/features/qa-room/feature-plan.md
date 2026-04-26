# Feature: qa-room

## Summary
The Q&A Room simulates a realistic investor demo day panel. Gemini Live API (via **Vertex AI**) powers three AI judge personas (VC, Domain Expert, User Advocate) in a single WebSocket session. The founder speaks; judges ask adversarial questions grounded in the session's hackathon brief, project brief, and pitch transcript. AudioWorklet handles the audio pipeline. The session is recorded incrementally as Q&A turns. A Zoom-like room layout with active speaker indicators creates a high-stakes atmosphere.

### Session Length
- **Target**: 8 minutes (matches YC Demo Day post-pitch Q&A pressure — enough to cover all 4 investor "vertebrae" questions)
- **Hard cap**: 15 minutes (enforced by `SessionTimer`; session is auto-ended at 15 min to avoid API audio-only session limit)
- **Minimum**: Soft warning shown if founder ends before turn 6 (< 3 exchange pairs)

## Scope
- Gemini Live WebSocket connection via ephemeral token (browser-direct)
- AudioWorklet audio pipeline: PCM 16-bit 16kHz in (mic), 24kHz out (speaker)
- 3 judge personas in a single Gemini system prompt
- Zoom-like layout: founder video tile (dominant), 3 judge tiles (secondary row)
- Active speaker indicator per tile (pulsing ring)
- Session timer (elapsed, counts up)
- Incremental Q&A turn capture: `POST /api/qa/turn` per turn
- 30-second heartbeat: `POST /api/qa/heartbeat`
- Token refresh on WebSocket reconnect: `POST /api/qa/token/refresh`
- Session state transition: `pitch_recorded` → `qa_completed`
- "End Session" flow with confirmation

## Out of Scope
- Video recording of Q&A (audio-only from judges)
- Judge persona selection (3 fixed personas, MVP)
- Real-time transcript display during Q&A
- Multiple concurrent Q&A sessions

---

## Component Inventory

### Pages / Routes
| Route | Purpose |
|---|---|
| `/session/[id]/room/qa` | Q&A Room sub-view |

### UI Components
| Component | File | Purpose |
|---|---|---|
| `QARoom` | `components/qa/QARoom.tsx` | Root Q&A room layout |
| `FounderTile` | `components/qa/FounderTile.tsx` | Dominant video tile (founder's camera) |
| `JudgeTile` | `components/qa/JudgeTile.tsx` | Secondary tile for one judge persona |
| `ActiveSpeakerRing` | `components/qa/ActiveSpeakerRing.tsx` | Pulsing animated ring on active speaker |
| `SessionTimer` | `components/qa/SessionTimer.tsx` | Elapsed time display |
| `QAControls` | `components/qa/QAControls.tsx` | Mute, End Session buttons |
| `EndSessionModal` | `components/qa/EndSessionModal.tsx` | Confirmation dialog before ending |
| `ConnectionStatusBanner` | `components/qa/ConnectionStatusBanner.tsx` | WebSocket state (connecting / reconnecting / live) |

### Hooks
| Hook | File | Purpose |
|---|---|---|
| `useGeminiLive` | `hooks/useGeminiLive.ts` | WebSocket lifecycle, token refresh, reconnect |
| `useAudioPipeline` | `hooks/useAudioPipeline.ts` | AudioWorklet setup, PCM encoding/decoding |
| `useTurnCapture` | `hooks/useTurnCapture.ts` | Detects turn boundaries, POSTs to /api/qa/turn |
| `useHeartbeat` | `hooks/useHeartbeat.ts` | 30s interval, POSTs to /api/qa/heartbeat |

### API Routes
| Route | Method | Purpose |
|---|---|---|
| `/api/qa/token` | POST | Issue Gemini Live ephemeral token |
| `/api/qa/token/refresh` | POST | Refresh expired ephemeral token |
| `/api/qa/turn` | POST | Write single Q&A turn incrementally |
| `/api/qa/heartbeat` | POST | Update `last_heartbeat_at` |
| `/api/qa/end` | POST | Finalize `qa_sessions` record, transition state |

---

## Audio Pipeline

```
Microphone (browser, typically 44.1kHz or 48kHz)
  → AudioWorklet (capture-processor.js)
  → Resample to 16kHz (REQUIRED — Live API expects 16kHz input)
  → PCM 16-bit, 16kHz, mono, little-endian
  → Chunk into 20–40ms frames (REQUIRED — larger chunks cause unacceptable latency)
  → sendRealtimeInput({ audio: { data, mimeType: 'audio/pcm;rate=16000' } })

Gemini Live WebSocket (receive audio)
  → PCM 24kHz chunks
  → AudioWorklet (playback-processor.js)
  → Speaker output

On server_content.interrupted = true:
  → IMMEDIATELY stop playback
  → Clear entire client-side audio queue
  → Deactivate judge ActiveSpeakerRing
```

AudioWorklet processors are loaded from `/public/worklets/` (not bundled with Next.js).

> **Critical**: `capture-processor.js` must implement a downsampler (e.g. linear interpolation or polyphase filter) from native mic rate to 16kHz. Sending 48kHz audio without resampling will not fail silently — transcription quality degrades severely and latency spikes.

---

## Turn Capture Logic

- A "turn" is defined as one continuous speaker utterance
- Turn boundary detected by Gemini Live `turn_complete` event
- Turn *end* (for UI subtitle clearing) detected by `generation_complete` event — **not** `turn_complete`. `turn_complete` marks the end of one conversational turn; `generation_complete` signals the model has finished its full response. Use `generation_complete` to deactivate the judge `ActiveSpeakerRing`.

### Tab Visibility Change
- Listen for `document.addEventListener('visibilitychange', ...)` in `useAudioPipeline`
- On `document.hidden = false`: call `audioContext.resume()` immediately
- Browsers suspend AudioContext when the tab is backgrounded — without this, audio is permanently frozen after any tab switch
- Each turn: `{ speaker: 'founder' | 'vc' | 'domain_expert' | 'user_advocate', content: string, timestamp_offset: number }`
- `timestamp_offset` = `Date.now() - qaSession.startedAt` (milliseconds from session start)

### Transcription Configuration (required — OFF by default)
The Live API does **not** emit transcription text unless explicitly enabled in the session setup config:
```typescript
const config = {
  responseModalities: ['AUDIO'],
  outputAudioTranscription: {},   // enables server_content.outputTranscription.text
  inputAudioTranscription: {},    // enables server_content.inputTranscription.text
  // ... other config
};
```
Without this, `outputTranscription` and `inputTranscription` will always be undefined — no text, no turn capture, no debrief data.

### Speaker Attribution
- **Judge turns**: from `server_content.outputTranscription.text`
- **Founder turns**: from `server_content.inputTranscription.text`
- Speaker identity for judge turns: Gemini Live provides no structured speaker metadata. Attribution is enforced via system prompt — model is instructed to begin every judge response with a tag on its own line (`[VC]`, `[DOMAIN_EXPERT]`, or `[USER_ADVOCATE]`). Parser strips tag, extracts speaker, writes clean content. Fallback: if tag absent, attribute to `lastKnownJudgeSpeaker`.

### Write Semantics
- `POST /api/qa/turn` fires immediately on turn completion — never batched
- `sequence_number` is client-incremented (0, 1, 2, ...)
- Turn writes use `INSERT ... ON CONFLICT (qa_session_id, sequence_number) DO NOTHING` — silent dedup on retry
- On End Session: if `pendingTurnContent` is non-empty (turn started but `turn_complete` not yet fired), wait up to 2 seconds for it to complete before calling `POST /api/qa/end`

### Barge-In Tracking
- Track `interruption_count: number` in memory during session
- Increment on every `server_content.interrupted = true` event
- Write `interruption_count` to `qa_sessions` on `POST /api/qa/end`
- Used by Debrief agent: high judge interruptions → "You lost the room mid-explanation"

---

## Judge Personas — System Prompt

Single Gemini system prompt contains all 3 personas. The model alternates between them.

**Mandatory speaker tag instruction (required for attribution — do not omit):**
```
CRITICAL INSTRUCTION: Every time you speak as a judge, you MUST begin your 
response with your judge tag on its own line, before any other text:

[VC] — when speaking as the VC judge
[DOMAIN_EXPERT] — when speaking as the Domain Expert
[USER_ADVOCATE] — when speaking as the User Advocate

Never start a response without this tag. Example format:
[VC]
What evidence do you have for that market size claim?
```

**Judge voices (assign distinct voices to distinguish personas audibly):**
- Alex (VC) → voice: `Charon` (authoritative, slightly clipped)
- Dr. Morgan (Domain Expert) → voice: `Kore` (measured, analytical)
- Sam (User Advocate) → voice: `Puck` (warmer, conversational)

Voices set per-judge via `speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName`. Since it's a single session/system prompt, the model may not honor per-speaker voice config. If the Live API does not support per-turn voice switching, use a single voice for all judges and rely on the tag prefix + system prompt tone cues to differentiate.

**VC (Alex — Tier-1 VC Partner)**: Focuses on market size, business model, scalability, competitive moat, team, path to funding. Asks hard questions on traction, unit economics, why now. Follows **McKinsey Pyramid Principle**: pushes for conclusion-first answers — *"Start with your answer, then give me the evidence."*

**Domain Expert (Dr. Morgan)**: Deep technical or domain knowledge. Tests whether the solution is feasible, whether the team understands failure modes, whether the approach has known limitations given the hackathon's constraints.

**User Advocate (Sam)**: Champions the end user. Questions whether real users have this problem, whether adoption barriers are addressed, whether the UX is practical for the stated audience.

**YC Vertebrae Coverage (add to system prompt):**
By end of session, ensure at least one judge question has probed each vertebra:
1. Who is the customer and what exact pain do they have?
2. Why is this the right moment (why now)?
3. What makes this technically or operationally hard?
4. Why is this team the one to solve it?

**Cross-judge dynamics (add to system prompt):**
Judges are a panel — they build on each other. It is encouraged to reference a prior judge's question: *"Building on what Alex asked..."*. Only one judge speaks at a time. Default rotation: VC → Domain Expert → User Advocate, but any judge can follow up directly if they have a related question.

**Toastmasters closing:**
The final question of the session (after ~7 minutes) should come from one judge and be a growth question, not a critique: *"If you could change one thing about how you explained [X]..."* This data feeds `next_drill` in the Debrief output.

**Opening question mandate (add to system prompt):**
The FIRST question of the session must not be a generic opener. It must cut directly to the most defensible assumption in the pitch transcript. Example: if the transcript claims "40% month-over-month growth", the VC should open with: *"Your transcript claims 40% MoM growth — where does that number come from?"* Never open with "Tell us about your project" — the judges already read the transcript.

**Founder silence handling:**
If the founder has not spoken for 8+ seconds after a judge question, the next judge should prompt with a follow-up or restate the question more specifically. Do not wait indefinitely.

**Interruption as signal:**
If a founder answer runs past 90 seconds on a single point, the active judge should interject: *"Let me stop you there — "* This mirrors real demo day time pressure and tests whether the founder can pivot concisely.

**Closing ritual (add to system prompt):**
At session end (triggered by `POST /api/qa/end` with a final `sendClientContent` flush before WebSocket close): one judge delivers: *"Thank you. We'll deliberate."* No further questions. This is the emotional punchline of the rehearsal — it must fire before the WebSocket is closed. Implementation: on End Session confirm, send `sendClientContent({ parts: [{ text: 'SESSION_ENDING' }], turnComplete: true })`, the model's closing line arrives, then close after `generation_complete`.

---

## WebSocket Lifecycle

### Authentication — Vertex AI Pattern
This project uses **Vertex AI** (not the Gemini Developer API) for access to Google Cloud credits.
- Model: `gemini-3-flash-preview` on Vertex AI (`location: 'global'`)
- Project: `invertible-tree-490306-j1`
- Auth: The browser cannot directly hold a service account key. `POST /api/qa/token` issues a **short-lived Google OAuth access token** server-side (via `google-auth-library`'s `getClient().getAccessToken()`, valid ~1 hour). The browser initializes `@google/genai` with `vertexai: true` using this token.
- No `auth_tokens.create()` (Gemini API ephemeral token API) — Vertex AI does not support that endpoint.

```
1. Mount → check pitch_recordings.status = 'ready' (guard, see below)
2. Fetch founder context from Supabase (client-side, before token call):
   - project_briefs.extracted_summary WHERE session_id AND is_active = true
   - hackathon_briefs.extracted_summary WHERE session_id AND is_active = true
   - pitch_recordings.transcript WHERE session_id AND is_active = true
   All three required — missing source noted in system prompt, not blocking.
3. POST /api/qa/token → { access_token, project, location, model, qa_session_id }
   Server does NOT return context — context is read client-side in step 2.
4. Intro screen renders (FR-QA-03b) — 3-second judge reveal animation.
   CRITICAL: AudioContext must be created/resumed inside the "Begin Session" button click handler
   (or the intro-screen-to-live transition tap). Browsers block AudioContext until a user gesture.
   Creating AudioContext before a gesture produces silent playback with no error.
5. Browser initializes @google/genai with { vertexai: true, project, location, accessToken }
6. ai.live.connect({ model, config }) → WebSocket opens
7. On WebSocket open:
   a. Set qa_sessions.started_at = NOW() via PATCH /api/qa/session (or include in first heartbeat)
   b. Send system prompt + founder context via sendClientContent({ turns: [...], turnComplete: false })
      (no initial_history_in_client_content flag — that is not a real API parameter)
   c. SessionResumptionUpdate messages arrive → save latest resumption_handle in memory
8. Session begins — audio bidirectional
7. Server sends GoAway { timeLeft } before connection reset (~10 min mark):
   → Use timeLeft to finish current judge turn
   → Reconnect using saved resumption_handle (no context re-injection needed — server preserves state)
8. On network drop: auto-reconnect with exponential backoff (1s, 2s, 4s, max 30s)
   → If resumption_handle present: reconnect with handle (preferred)
   → If no handle: re-send full system prompt + captured turns from Supabase (fallback)
9. User clicks "End Session" (or SessionTimer hits 15:00) → confirmation modal → flush pending turn →
   POST /api/qa/end → state = 'qa_completed'
```

### Session Resumption (replaces token refresh pattern)
The Live API periodically resets WebSocket connections (~10 min). Use `SessionResumptionUpdate` to survive this transparently:
```typescript
// In message handler:
if (msg.sessionResumptionUpdate?.newHandle) {
  resumptionHandle = msg.sessionResumptionUpdate.newHandle; // valid 2 hours
}

// On reconnect:
const config = {
  sessionResumption: { handle: resumptionHandle }, // restores full session context server-side
  // ... other config
};
```
With a valid handle, **do not re-send the system prompt or prior turns** — the server already has them. Only re-send if no handle is available (cold reconnect fallback).

### GoAway Handling
```typescript
if (msg.goAway?.timeLeft) {
  // e.g. timeLeft = '5s' — gracefully wrap up before forced ABORT
  if (timeLeft < 3000) reconnectWithHandle();
}
```

### Context Window Compression (required for sessions > 5 min)
```typescript
const config = {
  contextWindowCompression: {
    slidingWindow: {}, // compresses oldest tokens when window fills
  },
  // audio tokens accumulate ~25 tokens/sec; 8 min = ~12k tokens, well within 128k limit
  // compression is a safety net — enables sessions up to 15 min without hard termination
};
```

### Transcript Guard
Before allowing the WebSocket to open, verify `pitch_recordings.status = 'ready'` for this session. If status is still `'processing'`, show a blocking state: "Preparing your session… waiting for transcript" with a spinner and TanStack Query polling every 3s. Only open the WebSocket once transcript is confirmed ready. This prevents judges from asking generic questions without pitch context.

### Pre-Implementation Gate
**Before writing any audio pipeline code**, verify that `gemini-3-flash-preview` (Vertex AI) supports the Live WebSocket API on the `global` endpoint:
```bash
gcloud ai models list --region=global --filter="displayName:gemini-3-flash-preview"
```
If the model is not listed or does not support Live API, fall back to `gemini-2.0-flash-live-001` (known Vertex AI Live-capable model). Do not assume — a wrong model ID produces a cryptic 404 that looks like an auth error.

### Reconnect Context Re-injection
On every WebSocket reconnect (token refresh or network drop), the system prompt is re-sent. It must include:
1. Judge persona definitions
2. Brief + transcript context (same as initial)
3. Already-captured Q&A turns fetched from Supabase (`get_qa_turns`) formatted as prior conversation

This prevents judges from restarting from zero after a reconnect mid-session.

---

## Founder Context Injection

Judges MUST ask questions grounded in the session's actual content. Context is fetched server-side in `POST /api/qa/token` and sent to the browser for system prompt construction. Three required sources:

| Source | Table | Field | Purpose |
|---|---|---|---|
| Project brief | `project_briefs` | `extracted_summary` (JSONB) | What the project is, who it's for, core claims |
| Hackathon brief | `hackathon_briefs` | `extracted_summary` (JSONB) | Hackathon theme, constraints, judging criteria |
| Pitch transcript | `pitch_recordings` | `transcript` (text) | Verbatim or cleaned pitch — judges have "heard" this |

All three are required. If any source is missing (e.g., no hackathon brief was submitted), the system prompt notes it: *"Note: No hackathon brief was provided for this session."*

**System prompt context block format:**
```
=== FOUNDER CONTEXT ===

HACKATHON:
{hackathon_brief.extracted_summary as JSON or prose}

PROJECT:
{project_brief.extracted_summary as JSON or prose}

PITCH TRANSCRIPT (what the founder just presented to you):
{pitch_recordings.transcript}

=== END FOUNDER CONTEXT ===

You have just heard the pitch above. You are now running the Q&A.
```

Context is sent in `send_client_content` with `initial_history_in_client_content: true` in the session config (required for `gemini-3.1-flash-live-preview`; verify for Vertex AI model). After the first model turn, use `sendRealtimeInput` for any additional text.

---

## Judge Persona Intro Screen

Before the WebSocket opens, show a 3-second pre-room intro screen:
- Framer Motion `staggerChildren`: each judge tile staggers in with 400ms delay
- Each tile shows: judge name, archetype title, one-sentence description
  - **Alex** — Partner at Tier-1 VC Fund — "Will challenge your market size and path to funding first."
  - **Dr. Morgan** — Domain Expert — "Knows the technical and competitive landscape. Will probe feasibility."
  - **Sam** — User Advocate — "Champions the end user. Will ask if real people actually have this problem."
- After all 3 have appeared: 1-second hold, then room transitions to live state (WebSocket opens)
- No backend work — static copy, pure animation

## Live Judge Subtitle

- As Gemini Live text output streams (already consumed for turn capture), route judge text to a subtitle render target
- Rendered as a 1-line ticker at the bottom of the active judge tile (not a full transcript)
- Only shows judge text — not founder speech
- Updates in real-time, clears when judge turn ends
- This is a second binding on the existing text stream; no additional API calls

## Room Layout

```
┌─────────────────────────────────────────────────────┐
│  [Progress Bar: green 0→8min ████░░░ amber 8→15min] │
│                    [Session Timer]                   │
├──────────────────────────┬──────────────────────────┤
│                          │   [VC Judge Tile]        │
│   [Founder Video Tile]   │   [Domain Expert Tile]   │
│     (dominant, 60% w)    │   [User Advocate Tile]   │
│                          │   (secondary, 40% w)     │
├──────────────────────────┴──────────────────────────┤
│              [Mute]  [End Session]                  │
└─────────────────────────────────────────────────────┘
```

Judge tiles show a placeholder avatar (initials) + persona name. Active speaker gets pulsing ring.

### Session Progress Bar
- Thin bar (4px height) at the very top of the room, full width
- 0:00–8:00: fills green (target zone)
- 8:00–15:00: fills amber (overtime zone)
- Provides constant ambient time pressure without interrupting flow
- Complements `SessionTimer` — founders self-regulate rather than being surprised by the 8:00 yellow flash

### FounderTile Camera Handling
- Request camera: `navigator.mediaDevices.getUserMedia({ video: true, audio: false })` (mic is separate in AudioWorklet)
- On permission denied or device unavailable: show founder avatar with initials + name — do NOT crash or leave a black box
- `FounderTile` always renders; it conditionally shows live video stream or the avatar fallback

---

## Dependencies
- Gemini Live API via **Vertex AI** (`@google/genai` SDK, `vertexai: true`)
  - Project: `invertible-tree-490306-j1`, Location: `global`
  - Model: `gemini-3-flash-preview` (Vertex AI model ID — **verify Live API support before implementation**, see Pre-Implementation Gate above)
  - Auth: short-lived Google OAuth access token (server-side `google-auth-library`)
- Supabase: `qa_sessions`, `qa_turns`, `sessions` tables (client reads context directly; no context in token response)
- GCP Secret Manager: Google Cloud service account credentials
- `google-auth-library` (server-side token issuance)
- Camera access: `navigator.mediaDevices.getUserMedia({ video: true })` with fallback avatar
