# Feature: pitch-recording

## Summary
The founder submits a pitch video via one of two paths: **record live** in the browser (MediaRecorder + CountdownRing) or **upload a pre-recorded file**. Both paths converge at the same GCS resumable upload → STT pipeline → transcript polling flow. Before entering Q&A, the founder reviews their transcript and delivery metrics in a mandatory playback gate. Session transitions to `pitch_recorded` when transcript is ready.

## Scope
- **Two input modes** (tab-switched UI):
  - **Record**: Browser-based MediaRecorder (video + audio), 3-minute countdown ring
  - **Upload**: Drag-drop or click-to-upload a pre-recorded video file (MP4, WebM, MOV; max 500 MB)
- 3-2-1 countdown interstitial before recording begins (after "Start Recording" clicked)
- V4 GCS resumable signed URL (browser-direct; server never handles bytes)
- `pitch_recordings` row created at upload-url time (stores `mime_type`, `duration_seconds`)
- Async STT pipeline: Cloud Tasks → Speech-to-Text v2 Chirp 3
- mimeType → STT encoding + sampleRate mapping (see STT Pipeline section)
- Transcript polling (TanStack Query refetch interval)
- **Pre-Q&A playback gate**: transcript preview + delivery metrics before "Go to Q&A" CTA appears
- Coaching tip surfaced as a transition interstitial between Pitch and Q&A
- Session state transition: `brief_ready` → `pitch_recorded`
- Re-record / re-upload (new submission supersedes previous; locked once `qa_completed`)

## Out of Scope
- Multiple pitch attempts kept in history (only latest is active)
- Pitch editing / trimming
- Video playback in Debrief (post-hackathon backlog)
- Screen recording / share
- Audio-only recording (video required for MediaRecorder path)

---

## Component Inventory

### Pages / Routes
| Route | Purpose |
|---|---|
| `/session/[id]/room/pitch` | Pitch recording sub-view |

### UI Components
| Component | File | Purpose |
|---|---|---|
| `PitchInputSelector` | `components/pitch/PitchInputSelector.tsx` | Tab switcher: "Record" vs "Upload" mode |
| `PitchRecorder` | `components/pitch/PitchRecorder.tsx` | Root recording UI (record mode) |
| `CountdownRing` | `components/pitch/CountdownRing.tsx` | SVG ring timer, shows remaining time |
| `PreRecordingCountdown` | `components/pitch/PreRecordingCountdown.tsx` | 3-2-1 fullscreen interstitial before recording starts |
| `RecordingControls` | `components/pitch/RecordingControls.tsx` | Start / Stop / Re-record buttons |
| `VideoPreview` | `components/pitch/VideoPreview.tsx` | Live camera preview (during recording) |
| `VideoUploadZone` | `components/pitch/VideoUploadZone.tsx` | Drag-drop or click-to-upload video file (upload mode) |
| `PlaybackPreview` | `components/pitch/PlaybackPreview.tsx` | Local video playback before upload |
| `UploadProgressBar` | `components/pitch/UploadProgressBar.tsx` | shadcn/ui Progress bar for GCS upload |
| `TranscriptStatusBanner` | `components/pitch/TranscriptStatusBanner.tsx` | "Transcribing..." or "Transcript ready" |
| `PitchSummaryCard` | `components/pitch/PitchSummaryCard.tsx` | Transcript preview + delivery metrics (playback gate) |
| `CoachingTipInterstitial` | `components/pitch/CoachingTipInterstitial.tsx` | Pre-Q&A transition screen showing coaching tip |

### API Routes
| Route | Method | Purpose |
|---|---|---|
| `/api/pitch/upload-url` | POST | Issue V4 GCS resumable signed URL; creates `pitch_recordings` row; returns `pitch_recording_id` |
| `/api/pitch/process` | POST | Mark previous active recording inactive; enqueue Cloud Task STT job |
| `/api/pitch/status` | GET | Poll transcript readiness; returns transcript preview, delivery metrics, coaching tip |

### Cloud Tasks Handler
| Route | Method | Purpose |
|---|---|---|
| `/api/tasks/transcribe` | POST | Internal (OIDC-protected): calls GCP STT v2 Chirp 3, writes transcript, computes delivery metrics, generates coaching tip inline |

---

## Input Mode Selection

User arrives at pitch sub-view and sees `PitchInputSelector` with two tabs:
- **Record** (default): record live in browser
- **Upload**: upload a pre-recorded video file

Mode can be switched at any time before upload begins. After upload starts, the mode is locked.

---

## Record Flow

1. User selects "Record" tab (or arrives at default)
2. Camera/mic permission prompt fires on mount
3. If permissions denied: show error state "Camera and microphone access required" with browser-specific instructions
4. If permissions granted: show live `VideoPreview` + "Start Recording" CTA
5. User clicks "Start Recording":
   - `PreRecordingCountdown` renders fullscreen overlay: 3 → 2 → 1 → Go (1 second each)
   - On "Go": `MediaRecorder.start()` fires, CountdownRing begins from 3:00
   - CTA changes to "Stop Recording" (red)
6. Recording stops when user clicks "Stop Recording" or CountdownRing reaches 0:00
7. `dataavailable` chunks collected → single Blob
8. `PlaybackPreview` renders with the local blob (not yet uploaded)
9. `duration_seconds` computed: `Date.now() - recordingStartTime` (captured at step 5)
10. CTA shows "Upload & Continue"; "Re-record" secondary button appears

---

## Upload Flow (pre-recorded video)

1. User selects "Upload" tab
2. `VideoUploadZone` renders: drag-drop area accepts `video/mp4`, `video/webm`, `video/quicktime` (MOV)
3. File validation:
   - Accept: `video/mp4`, `video/webm`, `video/quicktime`
   - Reject: non-video types → inline error
   - Max size: 500 MB → reject with inline error
4. On valid file: show filename, duration (if readable from video element `loadedmetadata`), and file size
5. "Upload & Continue" CTA enables
6. `duration_seconds` extracted from `<video>` element `duration` property before upload
7. Proceeds identically to step 1 of the Upload Flow section below

---

## GCS Upload Flow

Applies to both Record and Upload modes:

1. User clicks "Upload & Continue"
2. `POST /api/pitch/upload-url` with `{ session_id, mime_type, duration_seconds }`:
   - Server creates `pitch_recordings` row with `status='pending'`, `mime_type`, `duration_seconds`, `is_active=false`
   - Returns `{ upload_url, gcs_path, pitch_recording_id }`
3. Browser uploads video to GCS using `XMLHttpRequest` resumable protocol:
   - Chunk size: 256 KB
   - `progress` events → `UploadProgressBar` updates 0–100%
   - On 308 (Incomplete): continue from next chunk offset
   - On network failure: pause, show "Retry" button
   - If user clicks Re-record/Re-upload during upload: `xhr.abort()` immediately, discard `pitch_recording_id`
4. On upload complete (GCS 200): call `POST /api/pitch/process` with `{ session_id, pitch_recording_id }`
   - Server marks any previous `is_active=true` pitch recording as `is_active=false`
   - Enqueues Cloud Task → updates pitch record to `status='processing'`
5. CTA updates to "Transcribing..." (disabled), `TranscriptStatusBanner` shows spinner

---

## STT Pipeline

Cloud Task calls `/api/tasks/transcribe`:

### mimeType → STT Encoding Mapping
| `mime_type` prefix | STT `encoding` | `sampleRateHertz` |
|---|---|---|
| `video/webm` | `WEBM_OPUS` | `48000` |
| `video/mp4` | `MP4` | `16000` |
| `video/quicktime` | `MP4` | `16000` |
| (default fallback) | `WEBM_OPUS` | `48000` |

The `mime_type` prefix match uses `startsWith` (ignores codec parameters like `;codecs=vp8,opus`).

### Steps
1. Read `pitch_recordings.mime_type` and `pitch_recordings.gcs_path`
2. Map `mime_type` → STT `encoding` + `sampleRateHertz` using table above
3. Call STT v2 Chirp 3 via `longrunningrecognize` (async operation)
4. Poll `operation.promise()` with `Promise.race` against a 5-minute timeout:
   - If timeout fires: set `pitch_recordings.status = 'failed'`, `sessions.state` unchanged, return 200
   - If STT fails: same — log error, set `status='failed'`, do not throw
5. Write `pitch_recordings.transcript` (full text)
6. Compute `transcript_quality` heuristic and write to `pitch_recordings.transcript_quality`:
   ```json
   {
     "word_count": 412,
     "estimated_wpm": 137,
     "filler_word_pct": 0.08
   }
   ```
   - `word_count`: split on whitespace
   - `estimated_wpm`: `word_count / (duration_seconds / 60)` — requires `duration_seconds` to be non-null; if null, omit `estimated_wpm`
   - `filler_word_pct`: count occurrences of `["um","uh","like","you know"]` / `word_count`
   - `short_pause_count`: omit entirely — not computable from transcript text
7. **Generate coaching tip** (inline, not a separate Cloud Task):
   - Fetch `project_briefs.extracted_summary` (active brief for session)
   - Call Gemini Flash (stateless): "In one sentence, give this founder the single most important thing to prepare for before facing investor Q&A about this pitch."
   - Input: `extracted_summary` JSON + first 500 chars of transcript
   - On success: write to `sessions.coaching_tip`
   - On failure: log and continue — never block step 8
8. Write `pitch_recordings.status = 'ready'`, `sessions.state = 'pitch_recorded'`

Steps 6, 7, 8 run sequentially. Only step 8 is critical-path. Steps 6 and 7 failures are logged and skipped.

---

## Re-Record / Re-Upload Flow

- "Re-record" / "Upload a different video" button available after recording stops or upload completes
- **Locked once session state is `qa_completed` or later** — show disabled state with tooltip: "Your Q&A is already complete. Starting a new pitch would require a new session."
- If user is mid-upload: `xhr.abort()` fires first, then UI resets
- Creates a new `pitch_recordings` row (new `pitch_recording_id`) — handled by `POST /api/pitch/process` which also archives the previous active row
- Resets UI to input mode selector
- Session state stays `pitch_recorded` if previously transcribed; new transcript overwrites when ready

## Pre-Q&A Playback Gate

When `pitch_recordings.status = 'ready'`:
1. `TranscriptStatusBanner` updates to "Transcript ready"
2. `PitchSummaryCard` renders:
   - First 500 characters of transcript
   - Delivery metrics row: `{estimated_wpm} WPM · {filler_word_pct}% filler words · {word_count} words`
   - Contextual hint: "Target: 130–150 WPM for investor presentations" (shown only if wpm data present)
3. CTA becomes "Go to Q&A →"
4. On CTA click → **before navigating**, show `CoachingTipInterstitial` (full-screen overlay):
   - If `sessions.coaching_tip` is present: render the tip with "Enter the Room →" button
   - If `coaching_tip` is null (tip not yet generated or failed): skip interstitial, navigate directly
   - Interstitial is shown at most once per session (track `hasSeenCoachingTip` in Zustand store)
5. Navigate to `/session/[id]/room/qa`

## Q&A System Prompt Contract (cross-feature dependency)

`POST /api/qa/token` builds the Gemini Live system prompt from:
- `hackathon_briefs.extracted_summary` (active) — judge calibration data (judging criteria, constraints)
- `project_briefs.extracted_summary` (active) — project context
- `pitch_recordings.transcript` (active) — what the founder actually said
- `pitch_recordings.transcript_quality` (active) — delivery signals for judge commentary

The system prompt must be assembled server-side at token issuance time. Gemini Live is not an ADK agent — it does not use MCP Toolbox. The four data points above must be fetched from Supabase in the `/api/qa/token` handler and injected into the `system_instruction` field of the Live API session config.

## transcript_quality → Debrief Agent Contract

`get_pitch_transcript` MCP tool (used by Debrief and Coach agents) returns:
```typescript
{
  transcript: string
  quality: {
    word_count: number
    estimated_wpm: number | null
    filler_word_pct: number
  } | null
}
```
The Debrief agent system prompt includes: "Delivery note: {estimated_wpm} WPM, {filler_word_pct * 100}% filler words. Factor into delivery scoring on the fracture map."

---

## Dependencies
- Supabase: `pitch_recordings`, `sessions` tables
- GCP Cloud Storage: video bucket
- GCP Cloud Tasks: transcription queue
- GCP Speech-to-Text v2: Chirp 3 model
- GCP Secret Manager: STT credentials
