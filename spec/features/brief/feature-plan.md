# Feature: brief

## Summary
The Brief phase captures the founder's project context and hackathon constraints. The founder pastes raw text and optionally uploads PDFs. A Brief Extraction Agent (Gemini Flash) silently extracts structured summaries in the background via Cloud Tasks. No structured input fields — founders dump raw context, AI extracts structure.

## Scope
- Project Context sub-view: large textarea + two PDF upload zones (pitch deck, notes)
- Hackathon Context sub-view: large textarea + optional URL input (event guidelines link)
- V4 GCS signed URL generation for PDF uploads (browser-direct, server never handles bytes)
- Hackathon guidelines: URL input — stored as `hackathon_guidelines_url`, no file handling
- Brief Extraction Agent: Gemini Flash, async via Cloud Tasks, outputs structured JSON to Supabase
- Session state transition: `draft` → `brief_ready` (triggered after extraction completes)
- Brief already submitted: show summary preview with option to edit
- **Judge Brief sub-view**: post-extraction adversarial readiness assessment with 3-tier badge

## Out of Scope
- Structured input fields (Mission Statement, The Problem, etc.) — AI extracts these
- Real-time extraction feedback (extraction is silent, state updates via polling)
- Multiple brief versions / history

---

## Component Inventory

### Pages / Routes
| Route | Purpose |
|---|---|
| `/session/[id]/brief` | Brief phase — defaults to `project` sub-view |
| `/session/[id]/brief/hackathon` | Hackathon context sub-view |
| `/session/[id]/brief/judge` | Judge Brief — adversarial readiness assessment (locked until `brief_ready`) |

### UI Components
| Component | File | Purpose |
|---|---|---|
| `ProjectBriefForm` | `components/brief/ProjectBriefForm.tsx` | Textarea + 2 PDF upload zones |
| `HackathonBriefForm` | `components/brief/HackathonBriefForm.tsx` | Textarea + optional URL input for event guidelines |
| `PDFUploadZone` | `components/brief/PDFUploadZone.tsx` | Drag-drop or click-to-upload; accepts `pitch_deck`, `notes` only |
| `BriefStatusBanner` | `components/brief/BriefStatusBanner.tsx` | Shows "Analyzing..." or "Ready" after submission |
| `BriefSummaryPreview` | `components/brief/BriefSummaryPreview.tsx` | Collapsed summary shown after extraction |
| `JudgeBriefPage` | `app/session/[id]/brief/judge/page.tsx` | 4-dimension traffic-light readiness card with 3-tier badge |
| `judgeLogic` | `lib/judgeLogic.ts` | Pure functions: `getTrafficLight`, `isReadyForRoom`, `getReadinessLevel` |
| `judgeDataLoader` | `lib/judgeDataLoader.ts` | Client-safe fetcher — calls `/api/brief` route, never direct Supabase |

### API Routes
| Route | Method | Purpose |
|---|---|---|
| `/api/brief/upload-url` | POST | Issue V4 GCS signed URL for PDF upload |
| `/api/brief` | POST | Save brief text + GCS paths → enqueue extraction Cloud Task |
| `/api/sessions/[id]` | GET | Poll session state for `brief_ready` transition |

### Cloud Tasks Handler
| Route | Method | Purpose |
|---|---|---|
| `/api/tasks/brief-extraction` | POST | Internal (OIDC-protected) — calls Gemini Flash, writes to Supabase, sets sessions.title |

---

## Data Flow

1. Founder types raw context in textarea (Project Context sub-view)
2. Founder optionally uploads pitch deck PDF and/or notes PDF
   - Upload: browser calls `/api/brief/upload-url` → gets V4 signed URL → uploads directly to GCS
3. Founder clicks "Continue to Hackathon Context" CTA → navigates to hackathon sub-view
4. Founder types raw hackathon guidelines in textarea
5. Founder optionally pastes event guidelines URL (Devpost or event landing page)
6. Founder clicks "Analyze Brief" CTA → calls `POST /api/brief` with:
   ```json
   {
     "session_id": "...",
     "project_context": "...",
     "pitch_deck_gcs": "gs://...",
     "notes_gcs": "gs://...",
     "hackathon_context": "...",
     "hackathon_guidelines_url": "https://devpost.com/..."
   }
   ```
7. API saves to `project_briefs` and `hackathon_briefs` tables (`hackathon_briefs.guidelines_url` stores the URL), enqueues Cloud Task
7. Cloud Task fires `POST /api/tasks/brief-extraction`:
   - Calls Gemini Flash with raw context + PDF text (extracted via GCS read)
   - Writes structured JSON to `extracted_summary` column in both tables
   - Sets `is_active = true` on the new brief rows; sets `is_active = false` on any previous rows for this session
   - Derives `sessions.title` from `extracted_summary.problem` (first 60 chars) and writes it
   - Updates session state to `brief_ready`
8. Frontend polls session state via TanStack Query → CTA changes to "Go to Room" when `brief_ready`

---

## Extraction Agent Contract

**Model**: `gemini-3-flash-preview` via Vertex AI (direct call, no ADK)
**Pattern**: Stateless, single call, async

**Input**:
```typescript
{
  project_context: string        // raw textarea (stored as raw_context)
  pitch_deck_text?: string       // extracted PDF text (if uploaded)
  notes_text?: string            // extracted PDF text (if uploaded)
  hackathon_context: string      // raw textarea (stored as raw_context — not raw_guidelines)
}
```

**Output** (written to `extracted_summary` jsonb):
```typescript
interface ProjectBriefSummary {
  problem: string           // 1-2 sentences
  solution: string          // 1-2 sentences
  target_user: string       // who benefits
  key_differentiator: string
  tech_stack_hint: string   // if mentioned
  team_size_hint: string    // if mentioned
}

interface HackathonBriefSummary {
  event_name: string
  theme: string
  judging_criteria: string[]
  constraints: string[]
  prizes: string[]
}
```

---

## PDF Upload Constraints
- Max file size: 20 MB per file
- Accepted MIME types: `application/pdf` only
- GCS bucket path: `gs://[BUCKET]/sessions/[session_id]/briefs/[filename]`
- Signed URL TTL: 15 minutes
- Upload is optional — textarea-only submission is valid

---

## State / Validation Rules
- At minimum, `project_context` must be non-empty (> 50 chars) to submit
- `hackathon_context` is optional but recommended (surfaced as soft prompt)
- If session is already `brief_ready`, show `BriefSummaryPreview` + "Re-analyze" secondary action
- Re-analyze: creates new brief records, re-runs extraction, updates session state (stays `brief_ready`)

---

## Dependencies
- Supabase: `project_briefs`, `hackathon_briefs`, `sessions` tables
- GCP Cloud Storage: brief PDF bucket
- GCP Cloud Tasks: brief extraction queue
- Vertex AI: Gemini Flash endpoint
- GCP Secret Manager: credentials
