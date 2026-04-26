# Validation: app-shell

## How to Verify

### Manual Test Cases

#### TC-SHELL-01: Fresh Session Creation
1. Clear localStorage (DevTools → Application → Storage → Clear All)
2. Navigate to `/`
3. **Expected**: Redirected to `/session/[new-uuid]/brief`
4. **Expected**: `sessionId` and `session_code` present in localStorage
5. **Expected**: Onboarding modal appears (4 steps visible)
6. **Expected**: TopNav shows phase tabs: Brief (active), Room (locked), Debrief (locked)

#### TC-SHELL-02: Session Persistence on Refresh
1. Complete TC-SHELL-01, dismiss onboarding
2. Note the session UUID from the URL
3. Hard refresh (`Cmd+Shift+R`)
4. **Expected**: Same UUID in URL, same session_code in TopNav
5. **Expected**: Onboarding modal does NOT appear

#### TC-SHELL-03: Session Recovery — Valid Code
1. Open a fresh incognito window
2. Navigate to `/`
3. Find the session_code from another session
4. Enter the code in the recovery field and click "Recover Session"
5. **Expected**: Navigated to `/session/[id]/brief` for the recovered session
6. **Expected**: Session state matches the recovered session's state

#### TC-SHELL-04: Session Recovery — Invalid Code
1. Enter "XX-1234" in the recovery field
2. **Expected**: Error message "Session not found. Check the code and try again."
3. **Expected**: No navigation occurs

#### TC-SHELL-05: Phase Lock Enforcement
1. New session (state = `draft`)
2. Click "Room" phase tab
3. **Expected**: No navigation — tab remains on Brief
4. Click "Debrief" phase tab
5. **Expected**: No navigation

#### TC-SHELL-06: CTA Accuracy
1. Test each state/sub-view combination from the CTA mapping table in requirements.md
2. For each: verify the button label matches exactly

#### TC-SHELL-07: Onboarding Modal Dismissal
1. Fresh session (onboarding visible)
2. Click outside modal
3. **Expected**: Modal remains open
4. Press Escape
5. **Expected**: Modal remains open
6. Click "Get Started" on step 4
7. **Expected**: Modal closes, app content visible

#### TC-SHELL-08: Mobile Guard
1. Open DevTools, set viewport to 800px width
2. **Expected**: MobileGuard overlay visible, app content not visible
3. Resize to 1024px
4. **Expected**: MobileGuard removed, app content visible

#### TC-SHELL-09: Session Code Copy
1. Click the session_code badge in TopNav
2. **Expected**: "Copied!" toast appears for ~2 seconds
3. Paste clipboard content
4. **Expected**: Pasted value matches the session_code

#### TC-SHELL-10: Info Circle
1. Click the floating info circle button
2. **Expected**: Popover opens with evaluation framework content
3. Click outside popover
4. **Expected**: Popover closes

---

## API Contract Tests

### POST /api/sessions
```
Request: {}
Expected Response (201):
{
  "id": "<uuid>",
  "session_code": "<2 uppercase letters>-<4 alphanumeric uppercase>"
}
```

### GET /api/sessions/recover?code=XX-XXXX
```
Valid code:
Expected Response (200): { "session_id": "<uuid>" }

Invalid code:
Expected Response (404): { "error": { "code": "session_not_found", "message": "..." } }
```

### GET /api/sessions/[id]
```
Valid ID:
Expected Response (200): { "id": "...", "state": "draft|brief_ready|...", "session_code": "..." }

Invalid ID:
Expected Response (404): { "error": { "code": "session_not_found", "message": "..." } }
```

---

## Zustand State Machine Tests

Verify these invariants hold:
- `isPhaseUnlocked('room')` returns `false` when state is `draft`
- `isPhaseUnlocked('room')` returns `true` when state is `brief_ready` or later
- `isPhaseUnlocked('debrief')` returns `false` until state is `qa_completed` or later
- `currentCTA()` returns correct label for every (state, activeSubView) pair
- `hasSeenOnboarding` persists across page reloads via localStorage

---

## Cloud Run Deployment Validation

- `docker build` succeeds with provided Dockerfile
- `docker run -p 3000:3000` starts server, `GET /` returns HTML
- Cloud Run service deployed with `min-instances=1`, `timeout=300s`, `cpu-boost`
- Health check: `GET /api/health` returns `200 { "status": "ok" }`

---

## Edge Cases

| Scenario | Expected Behavior |
|---|---|
| Two browser tabs with same session | Both reflect same state (polling keeps them in sync) |
| localStorage cleared mid-session | On next load, new session created (old session not lost in Supabase) |
| Session code entered in wrong case | Normalize to uppercase before API call |
| Cloud Run cold start during session creation | Retry 1x, then show error |
| Supabase unreachable | Show error state banner, do not crash app |
