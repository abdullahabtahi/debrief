-- Migration 004: add is_summary column to coach_messages
-- Replaces the broken sequence_number = -1 sentinel pattern.
-- A row with is_summary = true holds a compacted summary of earlier turns.
-- It uses a real sequence_number so the UNIQUE INDEX remains valid across multiple compactions.

ALTER TABLE coach_messages
  ADD COLUMN is_summary boolean NOT NULL DEFAULT false;
