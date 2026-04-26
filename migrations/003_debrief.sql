-- ============================================================
-- Demo Day Room — Debrief Phase
-- Migration: 003_debrief.sql
-- Adds: UNIQUE INDEX on debriefs + ADK session tables
-- ============================================================

-- Prevent duplicate active debriefs for the same session
CREATE UNIQUE INDEX IF NOT EXISTS idx_debriefs_session_active
  ON debriefs(session_id)
  WHERE is_active = true;

-- ── ADK TypeScript DatabaseSessionService tables ─────────────
-- Required by @iqai/adk createDatabaseSessionService (Supabase adapter)

CREATE TABLE IF NOT EXISTS adk_sessions (
  id           text        PRIMARY KEY,
  app_name     text        NOT NULL,
  user_id      text        NOT NULL,
  state        jsonb       NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS adk_events (
  id           text        PRIMARY KEY,
  session_id   text        NOT NULL REFERENCES adk_sessions(id) ON DELETE CASCADE,
  author       text        NOT NULL,
  content      jsonb       NOT NULL DEFAULT '{}',
  timestamp    float8      NOT NULL DEFAULT extract(epoch from now())
);

CREATE INDEX IF NOT EXISTS idx_adk_events_session
  ON adk_events(session_id);

-- ── jsonb_merge_debrief_progress ──────────────────────────────
-- Merges a partial JSON patch into debriefs.debrief_progress
-- Called fire-and-forget from the streaming route after each STATE_DELTA.

CREATE OR REPLACE FUNCTION jsonb_merge_debrief_progress(
  debrief_id uuid,
  patch      jsonb
)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE debriefs
  SET debrief_progress = COALESCE(debrief_progress, '{}'::jsonb) || patch
  WHERE id = debrief_id;
$$;
