# Requirements: pitch-recording

## Functional Requirements

### FR-PITCH-00: Input Mode Selection
- Pitch sub-view mounts with a two-tab selector: **Record** (default) and **Upload**
- Switching modes before upload resets any in-progress recording or file selection
- Once upload begins (XHR started), mode tabs are disabled

### FR-PITCH-01: Camera / Microphone Permission (Record mode only)
- On mount of pitch sub-view, call `navigator.mediaDevices.getUserMedia({ video: true, audio: true })`
- If permission denied: show error state "Camera and microphone access required to record your pitch" with browser-specific instructions to grant access
- Do not render recording UI until permissions granted
- If camera-only (no mic): also show error — mic is required for transcription

### FR-PITCH-02: Live Camera Preview
- Before recording: show `VideoPreview` with live camera feed (muted, no audio output)
- Video element: `autoplay`, `muted`, `playsInline`
- Preview fills the recording area (object-fit: cover)

### FR-PITCH-03: Recording Start
- "Start Recording" CTA triggers `PreRecordingCountdown`: a 3-2-1 fullscreen overlay (1 second per count)
- `MediaRecorder.start()` fires only after the countdown completes (on "Go")
- mimeType priority order (use `MediaRecorder.isTypeSupported()`):
  1. `video/webm;codecs=vp9,opus`
  2. `video/webm;codecs=vp8,opus`
  3. `video/webm`
  4. `video/mp4`
- CountdownRing begins counting down from 180 seconds (3 minutes)
- CTA changes to "Stop Recording" (red background)
- `recordingStartTime = Date.now()` captured when `MediaRecorder.start()` fires

### FR-PITCH-04: Countdown Ring
- SVG circular progress ring, animates smoothly
- Shows remaining time as `MM:SS` in center
- Ring color: green → yellow (< 60s) → red (< 30s)
- At 0:00: recording auto-stops (same behavior as manual stop)

### FR-PITCH-05: Recording Stop
- "Stop Recording" or auto-stop at 0:00 triggers `mediaRecorder.stop()`
- Collect all `dataavailable` chunks into a single `Blob`
- Compute `duration_seconds = Math.round((Date.now() - recordingStartTime) / 1000)`
- Render `PlaybackPreview` with the blob as video source
- CTA changes to "Upload & Continue"
- "Re-record" secondary button appears

### FR-PITCH-05b: Video Upload (Upload mode)
- `VideoUploadZone` accepts: `video/mp4`, `video/webm`, `video/quicktime` (MOV)
- Reject all other MIME types with inline error: "Only MP4, WebM, or MOV video files are accepted"
- Max file size: 500 MB. Reject larger files with: "File too large (max 500 MB)"
- On valid file: render `PlaybackPreview` using `URL.createObjectURL(file)` for local preview
- Extract `duration_seconds` from `<video>.duration` on `loadedmetadata` event
- Show filename, formatted file size, and formatted duration
- CTA "Upload & Continue" enables

### FR-PITCH-06: Playback Preview
- `PlaybackPreview`: `<video>` element with `src=URL.createObjectURL(blob|file)`, controls enabled
- Founder reviews recording/upload before committing to GCS upload
- Revoke object URL on component unmount (memory leak prevention)
- Playback does not block upload flow

### FR-PITCH-07: GCS Upload
- "Upload & Continue" triggers:
  1. `POST /api/pitch/upload-url` with `{ session_id, mime_type, duration_seconds }` where:
     - `mime_type` is `mediaRecorder.mimeType` (Record mode) or `file.type` (Upload mode)
     - `duration_seconds` is the computed integer from FR-PITCH-05 or FR-PITCH-05b
  2. Server creates `pitch_recordings` row (`status='pending'`, `mime_type`, `duration_seconds`, `is_active=false`) and returns `{ upload_url, gcs_path, pitch_recording_id }`
  3. GCS resumable upload using `XMLHttpRequest` (required for progress events)
  4. `UploadProgressBar` shows 0–100% based on `progress` events
  5. On complete: `POST /api/pitch/process` with `{ session_id, pitch_recording_id }` to enqueue STT
- CTA disabled during upload, shows "Uploading... X%"
- If user clicks Re-record/Re-upload during upload: `xhr.abort()` immediately, discard `pitch_recording_id`, reset to input mode selector

### FR-PITCH-08: Upload Resume on Failure
- If network drops during upload: show "Upload paused. Retry?" button
- Retry resumes from last acknowledged chunk (resumable upload protocol)
- Max retry attempts: 3 auto-retries with exponential backoff, then show manual retry button

### FR-PITCH-08b: Transcript Quality Signal
- After STT writes transcript, compute and write `transcript_quality` JSONB to `pitch_recordings`:
  ```json
  { "word_count": 412, "estimated_wpm": 137, "filler_word_pct": 0.08 }
  ```
- Heuristics (no LLM, no extra cost):
  - `word_count`: split transcript on whitespace
  - `estimated_wpm`: `word_count / (duration_seconds / 60)` — omit field if `duration_seconds` is null or zero
  - `filler_word_pct`: count `["um", "uh", "like", "you know"]` / `word_count` (case-insensitive)
  - `short_pause_count`: **omit entirely** — not computable from transcript text
- The `get_pitch_transcript` MCP tool response includes `quality` alongside `transcript`
- The Debrief agent system prompt: "Delivery note: {wpm} WPM, {filler}% filler words. Factor into delivery scoring."

### FR-PITCH-08c: Pre-Q&A Coaching Tip
- After `status = 'ready'` is written, generate coaching tip **inline** in the same `/api/tasks/transcribe` handler (not a separate Cloud Task):
  - Fetch `project_briefs.extracted_summary` for the session
  - Call Gemini Flash (stateless): "In one sentence, give this founder the single most important thing to prepare for before facing investor Q&A about this pitch."
  - Input: extracted summary JSON + first 500 chars of transcript
  - On success: write to `sessions.coaching_tip`
  - On failure: log and continue — never block `status='ready'` transition
- On pitch sub-view when `status = 'ready'`: `PitchSummaryCard` shows delivery metrics (word count, WPM, filler %) — tip is shown in `CoachingTipInterstitial`, not on the pitch page
- `GET /api/pitch/status` response when ready:
  ```json
  {
    "status": "ready",
    "transcript_preview": "First 500 chars...",
    "quality": { "word_count": 412, "estimated_wpm": 137, "filler_word_pct": 0.08 },
    "coaching_tip": "Your market size claim will get challenged — have a TAM/SAM breakdown ready."
  }
  ```
  Note: `coaching_tip` and `quality` may be null if their generation failed; frontend renders gracefully without them.
- `CoachingTipInterstitial` shown once per session (tracked in Zustand store as `hasSeenCoachingTip`) on first "Go to Q&A" click:
  - If `coaching_tip` present: show tip + "Enter the Room →" CTA
  - If `coaching_tip` null: skip interstitial, navigate directly

### FR-PITCH-09: Transcript Polling + Playback Gate
- After `POST /api/pitch/process`: poll `GET /api/pitch/status?session_id=...` every 5 seconds
- On `status = 'ready'`: stop polling, show `TranscriptStatusBanner` "Transcript ready"
- Render `PitchSummaryCard` with:
  - First 500 chars of transcript
  - Delivery metrics: `{wpm} WPM · {filler}% filler words · {word_count} words` (omit metric if null)
  - Context hint: "Target: 130–150 WPM for investor presentations" (shown only if wpm present)
- CTA updates to "Go to Q&A"
- Session state becomes `pitch_recorded`
- On `status = 'failed'`: stop polling, show `TranscriptStatusBanner` error, CTA becomes "Re-record"

### FR-PITCH-10: Re-record / Re-upload
- "Re-record" / "Upload a different video" button available after recording stops (before or after GCS upload)
- **Locked (disabled with tooltip) once session state is `qa_completed` or later**: "Your Q&A is already complete. Starting a new pitch would require a new session."
- If XHR upload is in-flight: `xhr.abort()` fires before UI reset
- If before GCS upload: discard blob/file, return to input mode selector
- If after GCS upload: new `pitch_recording_id` created at next `POST /api/pitch/upload-url`; `POST /api/pitch/process` archives previous active row
- `hasSeenCoachingTip` is reset to false on re-record (new tip may be generated)
- Session state stays `pitch_recorded` if previously transcribed; resets to `brief_ready` if re-recording before first successful transcription

### FR-PITCH-11: Return to Pitch View
- If session is already `pitch_recorded` (returning user):
  - Show `PitchSummaryCard` with existing transcript
  - CTA is "Go to Q&A"
  - "Re-record" secondary button available

---

## Non-Functional Requirements

### NFR-PITCH-01: Browser Compatibility
- MediaRecorder (Record mode): Chrome 80+, Firefox 79+, Edge 80+
- Safari not supported for Record mode in MVP (show "Please use Chrome or Firefox for recording")
- Upload mode works in all modern browsers including Safari (file input + XHR upload)
- `MediaRecorder.isTypeSupported()` used to select mimeType in priority order; if no supported type found, show Record mode error

### NFR-PITCH-02: File Size Limits
- Record mode: max recording duration 3 minutes → max expected ~100 MB (webm at ~6 Mbps)
- Upload mode: max 500 MB (covers most desktop MP4 screen recordings)
- GCS resumable URL TTL: 1 hour (sufficient for both paths)
- Chunk size for resumable upload: 256 KB

### NFR-PITCH-03: STT Timeout
- If STT does not complete within 5 minutes: mark `status = 'failed'`
- Show error: "Transcription took too long. Please re-record and try again."

### NFR-PITCH-04: Memory Management
- `URL.createObjectURL(blob|file)` must be revoked on `PlaybackPreview` unmount
- MediaRecorder chunks array must be cleared after Blob is constructed
- VideoUploadZone file reference must be cleared on Re-upload or mode switch

---

## Acceptance Criteria

- [ ] Mode selector renders with Record (default) and Upload tabs
- [ ] Switching modes before upload resets state cleanly
- [ ] Permission prompt fires on Record mode mount; denied permissions show error state
- [ ] Camera preview renders before recording starts (Record mode)
- [ ] "Start Recording" shows 3-2-1 countdown before MediaRecorder fires
- [ ] MediaRecorder uses highest-supported mimeType from priority list
- [ ] CountdownRing shows correct countdown, changes color at 60s and 30s
- [ ] Auto-stop at 0:00 behaves identically to manual stop
- [ ] `duration_seconds` captured correctly in both modes
- [ ] After stop/file-select, PlaybackPreview renders with local blob/file (no upload yet)
- [ ] Upload mode accepts MP4, WebM, MOV; rejects other types and files > 500 MB
- [ ] "Upload & Continue" uploads to GCS (not through server), progress visible
- [ ] `POST /api/pitch/upload-url` body includes `mime_type` and `duration_seconds`; response includes `pitch_recording_id`
- [ ] `pitch_recordings` row created at upload-url time with correct `mime_type` and `duration_seconds`
- [ ] After upload, STT is enqueued via `POST /api/pitch/process`
- [ ] Previous active `pitch_recordings` row is archived on `POST /api/pitch/process`
- [ ] Polling detects `status = 'ready'` and shows `PitchSummaryCard` with transcript + delivery metrics
- [ ] `GET /api/pitch/status` returns `transcript_preview`, `quality`, and `coaching_tip`
- [ ] `CoachingTipInterstitial` shown on first "Go to Q&A" click if coaching_tip is present; skipped if null
- [ ] Interstitial shown at most once per session
- [ ] CTA transitions to "Go to Q&A" when `pitch_recorded`
- [ ] Re-record/Re-upload button disabled with tooltip once `qa_completed`
- [ ] XHR aborted if Re-record/Re-upload clicked during active upload
- [ ] Upload failure shows Retry button (no silent hang)
- [ ] Object URLs revoked on unmount
- [ ] Safari shows correct error: Record mode unavailable, Upload mode still works
