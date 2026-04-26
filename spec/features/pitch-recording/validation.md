# Validation: pitch-recording

## How to Verify

### Manual Test Cases

#### TC-PITCH-00: Mode Selector
1. Navigate to `/session/[id]/room/pitch`
2. **Expected**: Two tabs visible: "Record" (active) and "Upload"
3. Click "Upload" tab
4. **Expected**: `VideoUploadZone` renders; camera preview absent
5. Click "Record" tab
6. **Expected**: Camera permission prompt fires (or camera preview if already granted)

#### TC-PITCH-01: Permission Denied (Record mode)
1. Navigate to `/session/[id]/room/pitch`
2. When permission prompt appears, click "Block"
3. **Expected**: Error state shown with instructions to grant access
4. **Expected**: No recording UI rendered

#### TC-PITCH-01b: Safari Browser (Record mode)
1. Open in Safari
2. Navigate to `/session/[id]/room/pitch`
3. **Expected**: Record tab shows browser warning: "Please use Chrome or Firefox for recording"
4. **Expected**: Upload tab still functional in Safari

#### TC-PITCH-02: Full Record → Upload → Transcript Flow
1. Grant camera + mic permissions (Record mode)
2. Click "Start Recording"
3. **Expected**: 3-2-1 countdown overlay renders, then CountdownRing starts from 3:00
4. Speak for 30 seconds, click "Stop Recording"
5. **Expected**: `PlaybackPreview` renders with local recording (no upload yet)
6. Click "Upload & Continue"
7. **Expected**: `UploadProgressBar` visible, percentage increases
8. Wait for upload to complete
9. **Expected**: "Transcribing..." banner appears
10. Wait for STT (may take 1–2 min in real environment)
11. **Expected**: "Transcript ready" banner + `PitchSummaryCard` with transcript excerpt + WPM/filler metrics
12. **Expected**: CTA = "Go to Q&A", session state = `pitch_recorded`
13. Click "Go to Q&A"
14. **Expected**: `CoachingTipInterstitial` shown (if coaching_tip present)
15. Click "Enter the Room"
16. **Expected**: Navigate to `/session/[id]/room/qa`
17. Navigate back to Room/Pitch
18. **Expected**: Interstitial does NOT show again (hasSeenCoachingTip = true)

#### TC-PITCH-02b: Full Upload Mode Flow
1. Switch to "Upload" tab
2. Drag a valid MP4 file onto the `VideoUploadZone`
3. **Expected**: `PlaybackPreview` renders with local video, filename/size/duration shown
4. Click "Upload & Continue"
5. **Expected**: Upload progress visible
6. Continue through STT as per TC-PITCH-02 steps 8–16

#### TC-PITCH-03: Auto-Stop at 3:00
1. Start recording (Record mode), do not stop manually
2. Wait for CountdownRing to reach 0:00
3. **Expected**: Recording stops automatically
4. **Expected**: `PlaybackPreview` renders with local recording

#### TC-PITCH-04: Ring Color Changes
1. Start recording
2. At 60 seconds remaining: **Expected** ring turns yellow
3. At 30 seconds remaining: **Expected** ring turns red

#### TC-PITCH-05: Re-record Before Upload
1. Start and stop recording
2. Click "Re-record"
3. **Expected**: Mode selector returns to Record tab with camera preview; `PlaybackPreview` gone
4. **Expected**: No upload request made

#### TC-PITCH-05b: Upload Mode — Invalid File
1. Switch to Upload tab
2. Drop a `.docx` file
3. **Expected**: Inline error "Only MP4, WebM, or MOV video files are accepted"
4. Drop a video file > 500 MB
5. **Expected**: Inline error "File too large (max 500 MB)"

#### TC-PITCH-06: Re-record After Upload
1. Complete full upload flow
2. Click "Re-record"
3. **Expected**: Mode selector shown; `PlaybackPreview` cleared
4. Record/upload again
5. **Expected**: New `pitch_recording_id` in Supabase; previous `is_active = false`

#### TC-PITCH-06b: Re-record Locked After QA
1. Complete full Q&A session (session state = `qa_completed`)
2. Navigate to Room → Pitch
3. **Expected**: Re-record button disabled with tooltip: "Your Q&A is already complete. Starting a new pitch would require a new session."

#### TC-PITCH-06c: Abort Upload on Re-record
1. Start upload, click "Re-record" mid-upload
2. **Expected**: Upload immediately stops (XHR aborted)
3. **Expected**: UI resets to mode selector; no `POST /api/pitch/process` fires

#### TC-PITCH-07: Return to Pitch View When Already Recorded
1. Complete full flow (transcript ready)
2. Navigate away (to Brief or Debrief)
3. Navigate back to Room → Pitch
4. **Expected**: `PitchSummaryCard` with existing transcript and delivery metrics shown immediately
5. **Expected**: CTA = "Go to Q&A"
6. **Expected**: Re-record option available (if session state < `qa_completed`)

#### TC-PITCH-08: Upload Failure Retry
1. Start upload, disable network mid-upload
2. **Expected**: Upload pauses, "Retry" button appears
3. Re-enable network, click "Retry"
4. **Expected**: Upload resumes from where it paused

---

## API Contract Tests

### POST /api/pitch/upload-url
```
Request: {
  "session_id": "<uuid>",
  "mime_type": "video/webm;codecs=vp9,opus",
  "duration_seconds": 94
}
Expected (200):
{
  "upload_url": "https://storage.googleapis.com/...",
  "gcs_path": "gs://[BUCKET]/sessions/[id]/pitches/[timestamp].webm",
  "pitch_recording_id": "<uuid>"
}
Side effect: pitch_recordings row created with status='pending', mime_type, duration_seconds, is_active=false
```

### POST /api/pitch/process
```
Request: { "session_id": "<uuid>", "pitch_recording_id": "<uuid>" }
Expected (200): { "status": "queued" }
Side effects:
  - Any previous pitch_recordings row with is_active=true for session → is_active=false
  - Cloud Task enqueued for transcription
  - pitch_recordings.status = 'processing'
```

### GET /api/pitch/status
```
?session_id=<uuid>

Processing: { "status": "processing" }

Ready:
{
  "status": "ready",
  "transcript_preview": "First 500 chars...",
  "quality": { "word_count": 412, "estimated_wpm": 137, "filler_word_pct": 0.08 },
  "coaching_tip": "Your market size claim will be challenged — have a TAM/SAM breakdown ready."
}
Note: quality and coaching_tip may be null — frontend renders gracefully.

Failed: { "status": "failed", "error": "Transcription failed" }
```

### POST /api/tasks/transcribe (internal)
```
Request: { "session_id": "<uuid>", "pitch_recording_id": "<uuid>" }
Expected side effects:
  - pitch_recordings.transcript populated
  - pitch_recordings.transcript_quality populated
  - sessions.coaching_tip populated (best-effort; null on failure)
  - pitch_recordings.status = 'ready'
  - sessions.state = 'pitch_recorded'
Expected (200): { "status": "completed" }
```

---

## Database State Verification

After successful upload + transcription:
```sql
SELECT status, transcript IS NOT NULL as has_transcript,
       transcript_quality, duration_seconds, mime_type, is_active
FROM pitch_recordings WHERE session_id = '<uuid>';
-- Expected: status='ready', has_transcript=true, is_active=true
-- transcript_quality: { word_count, estimated_wpm, filler_word_pct } (no short_pause_count)
-- duration_seconds: non-null integer

SELECT state, coaching_tip FROM sessions WHERE id = '<uuid>';
-- Expected: state='pitch_recorded'
-- coaching_tip: one-sentence string or null
```

---

## Edge Cases

| Scenario | Expected Behavior |
|---|---|
| User records then closes tab before uploading | Recording lost (browser memory), no Supabase record created |
| User uploads file then closes tab before GCS upload completes | `pitch_recordings` row exists with `status='pending'`; upload must be restarted |
| GCS signed URL expires during upload | Re-request URL via new `POST /api/pitch/upload-url`; upload restarts from position 0 |
| STT fails all retries | `status='failed'`, error shown, re-record/re-upload option presented |
| STT times out (> 5 min) | `status='failed'`, same error path |
| Very short recording (< 3 seconds) | Allow it — STT may return empty transcript; user can re-record |
| MediaRecorder produces 0 bytes | Show "Recording failed. Please try again." |
| Two uploads in flight simultaneously | Not possible — Re-record aborts XHR; only one active XHR at a time |
| Safari browser | Record tab shows unsupported warning; Upload tab fully functional |
| `duration_seconds` null (loadedmetadata fails on uploaded file) | `estimated_wpm` omitted from `transcript_quality`; not shown in `PitchSummaryCard` |
| Coaching tip generation fails | `sessions.coaching_tip` stays null; `CoachingTipInterstitial` skipped entirely |
| Re-record after `qa_completed` | Button disabled with tooltip; no state regression |
| MP4 file with AAC audio (not PCM) | STT encoding=`MP4` handles it; Chirp 3 accepts AAC in MP4 container |
