# Validation: sessions

## How to Verify

### Manual Test Cases

#### TC-SESS-01: Session List — With Existing Sessions
1. Have 2+ sessions in localStorage from prior activity
2. Navigate to `/`
3. **Expected**: One SessionCard per session, renders immediately
4. **Expected**: After Supabase fetch completes, titles update

#### TC-SESS-02: Session List — Empty State
1. Clear localStorage
2. Navigate to `/`
3. **Expected**: Empty state message shown
4. **Expected**: "Start New Session" CTA and RecoveryForm visible

#### TC-SESS-03: Session Card — State Badge Accuracy
1. For a session in `draft` state: **Expected** "In Progress" gray badge
2. For a session in `brief_ready`: **Expected** "Brief Ready" blue badge
3. For a session in `debrief_ready`: **Expected** "Debrief Ready" green badge

#### TC-SESS-04: Continue Navigation
1. Click "Continue" on a session with state `brief_ready`
2. **Expected**: Navigated to `/session/[id]/room/pitch`
3. Click "Continue" on a session with state `draft`
4. **Expected**: Navigated to `/session/[id]/brief`

#### TC-SESS-05: View Debrief Navigation
1. Click "View Debrief" on a session with state `debrief_ready`
2. **Expected**: Navigated to `/session/[id]/debrief/review`
3. **Expected**: Existing debrief rendered (no re-invocation)

#### TC-SESS-06: Remove Session
1. Click "Remove" on a SessionCard
2. **Expected**: Card disappears immediately from list
3. Verify in Supabase — session still exists (not deleted)
4. Check localStorage — session ID removed from `sessionIds[]`

#### TC-SESS-07: Recovery — Valid Code
1. From a different browser / incognito
2. Enter a valid session_code from another session
3. Click "Recover Session"
4. **Expected**: Navigated to the correct sub-view for that session's state
5. **Expected**: Session appears in localStorage

#### TC-SESS-08: Recovery — Invalid Code
1. Enter "ZZ-9999" in recovery form
2. **Expected**: Inline error "Session not found. Check the code and try again."
3. **Expected**: No navigation

#### TC-SESS-09: Recovery — Case Insensitivity
1. Enter "br-4x9k" (lowercase) in recovery form
2. **Expected**: Normalized to "BR-4X9K" before API call
3. **Expected**: Correct session found (same as entering uppercase)

#### TC-SESS-10: Start New Session
1. Click "Start New Session"
2. **Expected**: New session created, navigated to `/session/[new-id]/brief`
3. **Expected**: New session appears in list on return to `/`
4. **Expected**: Onboarding modal NOT shown (unless truly first session ever)

#### TC-SESS-11: Active Session Redirect
1. Set `activeSessionId` in Zustand (active in-progress session)
2. Navigate to `/` via address bar
3. **Expected**: Redirected to `/session/[activeSessionId]`

#### TC-SESS-12: Stale Session (Supabase 404)
1. Add a fake UUID to `sessionIds[]` in localStorage directly
2. Navigate to `/`
3. **Expected**: Card shows "Session not available" state
4. Click "Remove"
5. **Expected**: Card removed from list

---

## API Contract Tests

### GET /api/sessions/[id]
```
Valid session:
Expected (200):
{
  "id": "...",
  "session_code": "BR-XXXX",
  "state": "...",
  "last_active_at": "2026-04-26T00:00:00Z",
  "title_hint": "..." | null
}

Invalid session:
Expected (404): { "error": { "code": "session_not_found", "message": "..." } }
```

### GET /api/sessions/recover?code=...
```
Valid code: (200) { "session_id": "..." }
Invalid code: (404) { "error": { "code": "session_not_found" } }
```

---

## Edge Cases

| Scenario | Expected Behavior |
|---|---|
| 11+ sessions in localStorage | Oldest trimmed to keep max 10 |
| Same session_code recovered twice | session_id added to list only once (dedup check) |
| Session in Supabase but `extracted_summary` null | Title shows "Untitled Session" |
| `last_active_at` in the future (clock skew) | Show "Just now" as fallback |
| User removes all sessions | Empty state shown |
| Network offline when loading list | Render localStorage data, no error for missing Supabase data |
| Two tabs open with same session list | Each tab independently manages its own localStorage (no cross-tab sync in MVP) |
