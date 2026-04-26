-- ============================================================
-- Demo Day Room — Q&A Room Phase
-- Migration: 002_qa_room.sql
-- Adds: interruption_count to qa_sessions
-- ============================================================

ALTER TABLE qa_sessions
  ADD COLUMN IF NOT EXISTS interruption_count int NOT NULL DEFAULT 0;
