# Validation: brief

## How to Verify

### Manual Test Cases

#### TC-BRIEF-01: Project Context Submission (Text Only)
1. Navigate to `/session/[id]/brief`
2. Type 100+ characters in the textarea
3. Click "Continue to Hackathon Context"
4. Optionally type in hackathon textarea
5. Click "Analyze Brief"
6. **Expected**: `BriefStatusBanner` shows "Analyzing your brief..." with spinner
7. Wait for extraction (typically 5-15 seconds)
8. **Expected**: Banner updates to "Brief analyzed ✓"
9. **Expected**: Session state becomes `brief_ready`, CTA becomes "Go to Room"

#### TC-BRIEF-02: PDF Upload — Valid File
1. On Project Context, click "Pitch Deck" upload zone
2. Select a PDF file under 20 MB
3. **Expected**: Upload progress spinner appears
4. **Expected**: On completion: filename + size + green checkmark shown
5. Repeat for "Notes" upload zone

#### TC-BRIEF-02b: Hackathon Guidelines URL Input
1. On Hackathon Context sub-view, paste a Devpost URL in the "Event guidelines URL" field
2. **Expected**: URL stored in Zustand as `hackathonGuidelinesUrl`
3. Click "Brief the judges"
4. **Expected**: `POST /api/brief` body includes `hackathon_guidelines_url: "https://devpost.com/..."`
5. After submission, run:
   ```sql
   SELECT guidelines_url FROM hackathon_briefs WHERE session_id = '<uuid>' AND is_active = true;
   ```
6. **Expected**: Non-null URL matching the pasted value

#### TC-BRIEF-02c: Hackathon Guidelines URL — Clear
1. Paste a URL in the guidelines field
2. Clear the input
3. Click "Brief the judges"
4. **Expected**: `POST /api/brief` body has `hackathon_guidelines_url: null`

#### TC-BRIEF-03: PDF Upload — Invalid File Type
1. Attempt to upload a `.docx` file
2. **Expected**: Inline error "Only PDF files are accepted"
3. **Expected**: No upload request made

#### TC-BRIEF-04: PDF Upload — File Too Large
1. Attempt to upload a PDF > 20 MB
2. **Expected**: Inline error "File too large (max 20 MB)"
3. **Expected**: No signed URL requested

#### TC-BRIEF-05: Empty Project Context Validation
1. Leave textarea empty
2. Click "Analyze Brief"
3. **Expected**: Inline validation error shown
4. **Expected**: No API call made

#### TC-BRIEF-06: State Preserved Across Navigation
1. Type text in Project Context textarea
2. Click "Continue to Hackathon Context"
3. Click back arrow to Project Context
4. **Expected**: Previously typed text still in textarea

#### TC-BRIEF-07: Brief Summary Preview on Return
1. Complete full brief submission and wait for `brief_ready`
2. Navigate away to Room then back to Brief
3. **Expected**: `BriefSummaryPreview` card visible with extracted data
4. **Expected**: "Edit Brief" button present

#### TC-BRIEF-08: Re-submission
1. From `brief_ready` state, click "Edit Brief" in BriefSummaryPreview
2. Modify textarea content
3. Click "Analyze Brief" again
4. **Expected**: New extraction runs, summary updates
5. **Expected**: Session state remains `brief_ready` throughout

#### TC-BRIEF-09: Extraction Failure
1. Simulate extraction failure (mock Cloud Task failure in dev)
2. **Expected**: After 3 retries, session `status` becomes `failed`
3. **Expected**: Frontend shows "Brief analysis failed. Try submitting again."
4. **Expected**: CTA remains "Analyze Brief"

#### TC-BRIEF-10: Judge Brief Sub-View — Traffic Lights
1. Complete brief submission and wait for `brief_ready`
2. Navigate to Judge Brief tab
3. **Expected**: 4 rows visible (Data Strategy, Competitive Moat, Market Validation, Failure Modes)
4. **Expected**: Each row has a green, amber, or red dot based on extracted content
5. **Expected**: Overall badge shows `Ready for Room`, `Caution`, or `Vulnerable` correctly

#### TC-BRIEF-11: Judge Brief Sub-View — Locked State
1. When session state is `draft`, click the Judge Brief tab
2. **Expected**: Tab is greyed and click is a no-op (no navigation)

---

## API Contract Tests

### POST /api/brief/upload-url
```
Request (project files): { "session_id": "...", "file_type": "pitch_deck", "content_type": "application/pdf" }
Expected (200): { "upload_url": "https://storage.googleapis.com/...", "gcs_path": "gs://..." }

Note: file_type 'hackathon_guidelines' removed — guidelines now provided as URL, not file upload.
```

### POST /api/brief
```
Request:
{
  "session_id": "...",
  "project_context": "...",
  "pitch_deck_gcs": "gs://..." | null,
  "notes_gcs": "gs://..." | null,
  "hackathon_context": "...",
  "hackathon_guidelines_url": "https://devpost.com/..." | null
}
Expected (201): { "brief_id": "...", "status": "queued" }

Invalid URL (not parseable): { "hackathon_guidelines_url": "not-a-url" }
Expected (400): { "error": { "code": "INVALID_INPUT", ... } }

Empty project_context:
Expected (422): { "error": { "code": "validation_error", "details": [{ "field": "project_context", ... }] } }
```

### POST /api/tasks/brief-extraction (internal)
```
Request: { "session_id": "...", "project_brief_id": "...", "hackathon_brief_id": "..." }
Expected (200): { "status": "completed" }
Side effects:
  - project_briefs.extracted_summary populated
  - hackathon_briefs.extracted_summary populated
  - sessions.state = 'brief_ready'
```

---

## Extraction Output Validation

After extraction completes, verify `extracted_summary` in Supabase:
```sql
SELECT extracted_summary FROM project_briefs WHERE session_id = '...';
```
Expected structure matches `ProjectBriefSummary` interface:
- `problem` field non-null
- `solution` field non-null
- `target_user` field non-null
- `key_differentiator` field non-null

---

## GCS Upload Validation

- After upload, verify file exists in GCS bucket at expected path
- File is accessible from the extraction agent (service account has `storage.objectViewer` role)
- Signed URL expires after 15 minutes (test: try using URL after expiry, expect 403)

---

## Edge Cases

| Scenario | Expected Behavior |
|---|---|
| User uploads then removes PDF | GCS file may remain but `pitch_deck_gcs = null` in submission |
| User pastes then clears hackathon guidelines URL | `hackathon_guidelines_url = null` in submission |
| User submits while previous extraction in-progress | Previous Cloud Task marked `superseded`, new task enqueued |
| Signed URL expires before upload starts | Re-request URL on retry |
| Network drops during GCS upload | Show retry button on upload zone |
| Extraction produces empty fields | Acceptable — empty string fields in JSON |
| Project context > 100,000 chars | Truncate to 100,000 chars before sending to Gemini (with note in logs) |
| Hackathon context empty | Extraction proceeds with `hackathon_context: ""` — all hackathon summary fields may be empty |
