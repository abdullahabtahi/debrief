-- ============================================================
-- Demo Day Room — Initial Schema
-- Migration: 001_initial.sql
-- Source of truth: CLAUDE.md § Database Schema
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE sessions (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_code      varchar(7)  NOT NULL UNIQUE,
  state             text        NOT NULL DEFAULT 'draft'
                                CHECK (state IN ('draft','brief_ready','pitch_recorded','qa_completed','debrief_ready','completed')),
  title             text,
  coaching_tip      text,
  last_active_at    timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE project_briefs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        uuid        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  raw_context       text,
  pitch_deck_gcs    text,
  notes_gcs         text,
  extracted_summary jsonb,
  status            text        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','extracting','ready','failed','superseded')),
  is_active         boolean     NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE hackathon_briefs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        uuid        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  raw_context       text,
  extracted_summary jsonb,
  status            text        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','extracting','ready','failed','superseded')),
  is_active         boolean     NOT NULL DEFAULT false,
  guidelines_url    text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pitch_recordings (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id           uuid        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  is_active            boolean     NOT NULL DEFAULT false,
  video_gcs            text,
  mime_type            text,
  transcript           text,
  transcript_quality   jsonb,
  duration_seconds     int,
  status               text        NOT NULL DEFAULT 'pending'
                                   CHECK (status IN ('pending','uploading','processing','ready','failed')),
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE qa_sessions (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id           uuid        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  pitch_recording_id   uuid        REFERENCES pitch_recordings(id),
  started_at           timestamptz,
  ended_at             timestamptz,
  duration_seconds     int,
  last_heartbeat_at    timestamptz,
  interruption_count   int         NOT NULL DEFAULT 0,
  status               text        NOT NULL DEFAULT 'active'
                                   CHECK (status IN ('active','ended','abandoned')),
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE qa_turns (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  qa_session_id    uuid    NOT NULL REFERENCES qa_sessions(id) ON DELETE CASCADE,
  sequence_number  int     NOT NULL,
  speaker          text    NOT NULL
                           CHECK (speaker IN ('founder','vc','domain_expert','user_advocate')),
  content          text,
  timestamp_offset int
);

CREATE TABLE debriefs (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            uuid        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  qa_session_id         uuid        REFERENCES qa_sessions(id),
  is_active             boolean     NOT NULL DEFAULT false,
  attempt_number        int         NOT NULL DEFAULT 1,
  output                jsonb,
  debrief_progress      jsonb,
  coach_opening_prompts jsonb,
  status                text        NOT NULL DEFAULT 'generating'
                                    CHECK (status IN ('generating','complete','failed')),
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE coach_messages (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       uuid        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  debrief_id       uuid        NOT NULL REFERENCES debriefs(id) ON DELETE CASCADE,
  role             text        NOT NULL CHECK (role IN ('founder','coach')),
  content          text,
  sequence_number  int         NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================

-- One active project brief per session
CREATE UNIQUE INDEX idx_project_briefs_active_per_session
  ON project_briefs (session_id)
  WHERE is_active = true;

-- One active hackathon brief per session
CREATE UNIQUE INDEX idx_hackathon_briefs_active_per_session
  ON hackathon_briefs (session_id)
  WHERE is_active = true;

-- One active pitch recording per session
CREATE UNIQUE INDEX idx_pitch_recordings_active_per_session
  ON pitch_recordings (session_id)
  WHERE is_active = true;

-- One active debrief per session
CREATE UNIQUE INDEX idx_debriefs_active_per_session
  ON debriefs (session_id)
  WHERE is_active = true;

-- Q&A turns: unique sequence per session (supports ON CONFLICT DO NOTHING retries)
CREATE UNIQUE INDEX idx_qa_turns_sequence
  ON qa_turns (qa_session_id, sequence_number);

-- Coach messages: unique sequence per debrief (supports ON CONFLICT DO NOTHING retries)
CREATE UNIQUE INDEX idx_coach_messages_sequence
  ON coach_messages (debrief_id, sequence_number);

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Auto-update sessions.last_active_at on every UPDATE
CREATE OR REPLACE FUNCTION set_last_active_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_active_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sessions_last_active_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION set_last_active_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
-- All app tables: service_role only (blocks accidental anon reads).
-- Server code uses service_role key (bypasses RLS correctly).

ALTER TABLE sessions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_briefs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE hackathon_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pitch_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_turns         ENABLE ROW LEVEL SECURITY;
ALTER TABLE debriefs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_messages   ENABLE ROW LEVEL SECURITY;

-- service_role bypasses RLS by default in Supabase — no explicit policy needed.
-- The following policies block anon/authenticated roles explicitly.

CREATE POLICY "deny_anon" ON sessions         FOR ALL TO anon USING (false);
CREATE POLICY "deny_anon" ON project_briefs   FOR ALL TO anon USING (false);
CREATE POLICY "deny_anon" ON hackathon_briefs FOR ALL TO anon USING (false);
CREATE POLICY "deny_anon" ON pitch_recordings FOR ALL TO anon USING (false);
CREATE POLICY "deny_anon" ON qa_sessions      FOR ALL TO anon USING (false);
CREATE POLICY "deny_anon" ON qa_turns         FOR ALL TO anon USING (false);
CREATE POLICY "deny_anon" ON debriefs         FOR ALL TO anon USING (false);
CREATE POLICY "deny_anon" ON coach_messages   FOR ALL TO anon USING (false);
