# Validation: debrief

## How to Verify

### Manual Test Cases

#### TC-DEBRIEF-01: Full Debrief Flow
1. Ensure session state is `qa_completed`
2. Navigate to `/session/[id]/debrief/review`
3. **Expected**: `DebriefTriggerCard` visible with "Get Debrief" CTA
4. Click "Get Debrief"
5. **Expected**: Within 3 seconds, VerdictCard begins streaming
6. **Expected**: FractureMap appears with 3 axes, bars animate
7. **Expected**: Strengths, Weaknesses, Issues sections populate
8. **Expected**: NextDrillCard appears as last element
9. **Expected**: "Talk to Coach" CTA appears after stream completes
10. **Expected**: Session state = `debrief_ready`

#### TC-DEBRIEF-02: Fracture Map Completeness
1. After debrief renders:
   - **Expected**: All 3 axes (VC, Domain Expert, User Advocate) have a numeric score
   - **Expected**: All 3 axes have a `top_concern` text below the bar
   - **Expected**: Overall score is visible and matches the correct range
   - **Expected**: Score color coding: red for 0-3, amber for 4-5, yellow for 6-7, green for 8-10

#### TC-DEBRIEF-03: Debrief Persistence on Return
1. Complete debrief (stream finishes)
2. Navigate away to Room
3. Navigate back to Debrief
4. **Expected**: Debrief renders immediately (no "Get Debrief" CTA)
5. **Expected**: Same content as before (loaded from Supabase)
6. **Expected**: No re-invocation of agent

#### TC-DEBRIEF-04: Re-run Debrief
1. After debrief renders, click "Re-run Debrief" secondary button
2. **Expected**: Debrief TriggerCard-like state (or confirmation modal)
3. Click confirm
4. **Expected**: New streaming begins
5. Verify in Supabase:
```sql
SELECT attempt_number, is_active FROM debriefs WHERE session_id = '...' ORDER BY attempt_number;
-- Expected: previous record has is_active=false, new record has is_active=true
```

#### TC-DEBRIEF-05: Evidence Specificity
1. Review IssuesList sections
2. **Expected**: Evidence quotes reference actual content from the session transcript or Q&A turns
3. **Expected**: No generic advice that could apply to any pitch

#### TC-DEBRIEF-06: NextDrillCard Styling
1. **Expected**: `NextDrillCard` visually distinct from other cards (different background)
2. **Expected**: Contains exactly one actionable instruction (not a list)

#### TC-DEBRIEF-07: Interrupted Debrief Recovery
1. Start debrief stream
2. Kill the browser tab (or hard-disconnect) mid-stream
3. Return to debrief view
4. **Expected**: `DebriefStreamingView` renders with whatever sections arrived in `debrief_progress`
5. **Expected**: Amber banner visible: "Debrief was interrupted — re-run to complete"
6. **Expected**: "Re-run Debrief" CTA visible
7. **Expected**: No automatic re-invocation on mount

#### TC-DEBRIEF-08: Empty Section States
1. Create a session where Q&A ended with 0 turns (session ended immediately after starting)
2. Complete debrief flow
3. **Expected**: `qa_vulnerabilities` section renders with: *"No Q&A vulnerabilities — judges didn’t surface questions."*
4. **Expected**: Section is present and visible, not blank, not missing from the page
5. **Expected**: All other sections render normally

#### TC-DEBRIEF-09: Re-run Confirmation Modal
1. After debrief stream completes, click "Re-run Debrief"
2. **Expected**: Confirmation modal appears immediately (no stream starts yet)
3. **Expected**: Modal body contains: *"Your previous debrief and coach conversation will be archived"*
4. Click "Cancel"
5. **Expected**: Modal closes, original debrief still displayed in full
6. Click "Re-run Debrief" → click "Re-run" in modal
7. **Expected**: New streaming begins; old debrief is archived
8. Navigate to Coach tab
9. **Expected**: Coach conversation is empty (new `debrief_id` scope, old messages not loaded)

#### TC-DEBRIEF-10: Persona-Tagged Tooltip Evidence
1. After debrief renders, hover over the **VC** axis bar in FractureMap
2. **Expected**: Tooltip shows an evidence quote from a `qa_vulnerabilities` item where `persona === 'vc'`
3. Repeat for Domain Expert (`persona === 'domain_expert'`) and User Advocate (`persona === 'user_advocate'`)
4. If no persona-tagged items exist: **Expected**: Tooltip falls back to first `qa_vulnerabilities` item
5. **Expected**: Tooltip styled as a blockquote

#### TC-DEBRIEF-11: 90-Second Client Abort
1. Start debrief stream
2. Simulate a stalled stream (disconnect after the first STATE_DELTA)
3. Wait 90 seconds
4. **Expected**: UI shows: *"Debrief is taking too long. Your session may have been saved — try returning."*
5. **Expected**: If `debrief_progress` has content: "Show partial results" link is visible
6. **Expected**: Clicking "Show partial results" renders whatever sections were saved

#### TC-DEBRIEF-12: DebriefSectionNav Behaviour
1. Begin debrief stream
2. **Expected**: `DebriefSectionNav` is visible immediately with all pills present
3. **Expected**: Pills for sections not yet received are greyed and non-clickable
4. As each section’s STATE_DELTA arrives, its pill becomes active and clickable
5. Click "Fracture Map" pill
6. **Expected**: Page scrolls to FractureMap section smoothly
7. On scroll, active pill highlights the section currently in viewport

---


### POST /api/debrief
```
Request: { "session_id": "..." }
Response: SSE stream (AG-UI protocol)

First event type: text_delta (VerdictCard starts streaming)
Stream completes with: structured DebriefOutput data

After stream, Supabase state:
  debriefs record with:
    - verdict: non-null string
    - fracture_map: JSON with all 3 axes + overall_score
    - strengths: array of Finding objects
    - weaknesses: array of Finding objects
    - narrative_issues, delivery_issues, qa_vulnerabilities: arrays
    - next_drill: non-null string
    - is_active: true
  sessions.state = 'debrief_ready'
```

---

## Streaming Header Validation (Cloud Run)
```bash
curl -N -X POST https://[SERVICE_URL]/api/debrief \
  -H "Content-Type: application/json" \
  -d '{"session_id": "..."}' \
  -v 2>&1 | grep -i "transfer-encoding"
# Expected: Transfer-Encoding: chunked
```

---

## Database State After Debrief
```sql
SELECT
  verdict IS NOT NULL AS has_verdict,
  fracture_map->'vc'->'score' AS vc_score,
  fracture_map->'domain_expert'->'score' AS de_score,
  fracture_map->'user_advocate'->'score' AS ua_score,
  fracture_map->>'overall_score' AS overall_score,
  jsonb_array_length(strengths) AS strength_count,
  jsonb_array_length(weaknesses) AS weakness_count,
  next_drill IS NOT NULL AS has_drill,
  is_active
FROM debriefs WHERE session_id = '...';
-- Expected: all non-null, counts 1-5, is_active=true
```

---

## Edge Cases

| Scenario | Expected Behavior |
|---|---|
| Agent returns null fracture_map | Show error "Debrief incomplete. Try running again." — do not render partial |
| Agent times out (Cloud Run 300s limit) | Stream ends, partial debrief saved, error shown |
| User clicks "Get Debrief" twice rapidly | Second click ignored while first stream is active |
| Q&A had 0 turns (session ended immediately) | Agent still runs; qa_vulnerabilities section may be empty |
| Transcript is very short (< 100 words) | Agent may flag this in delivery_issues; overall scores will likely be low |
| Brief had no PDF uploads | Agent works with text-only context |
| User navigates away mid-stream | Stream is abandoned client-side; server continues writing to `debrief_progress` until connection drops. On return: if `status != 'complete'`, render partial content with interrupted banner. |
| Concurrent debrief guard (double-click) | Second `POST /api/debrief` while first stream is active returns `409 Conflict`; client ignores it and existing stream continues |
| `is_active` unique index violation | DB rejects INSERT of second `is_active=true` row for same session; route handler must `SET is_active=false` on previous row in same transaction before creating new `debriefs` row |
