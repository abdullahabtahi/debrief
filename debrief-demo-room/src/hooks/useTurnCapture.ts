'use client'

import { useCallback, useRef, useState } from 'react'

export type JudgeSpeaker = 'vc' | 'domain_expert' | 'user_advocate'
export type Speaker = 'founder' | JudgeSpeaker

export interface Turn {
  speaker: Speaker
  content: string
  timestampOffset: number
}

export interface TurnCaptureCallbacks {
  onTurnComplete: (turn: Turn, sequenceNumber: number) => void
  onJudgeSubtitle: (text: string | null, speaker: JudgeSpeaker | null) => void
  onActiveSpeakerChange: (speaker: Speaker | null) => void
  onInterruption: () => void
  /**
   * Fires at natural sentence boundaries (`. ? !`) and at length-based rollovers.
   * Provides rolling-window history without waiting for generation_complete.
   * Does NOT map 1:1 to DB turns.
   */
  onSentenceComplete?: (sentence: string, speaker: JudgeSpeaker) => void
}

interface UseTurnCaptureOptions {
  sessionId: string
  /** Getter instead of value — reads the latest ref at call time, avoids null at render */ 
  getQaSessionId: () => string | null
  sessionStartedAt: number | null
  callbacks: TurnCaptureCallbacks
}

// Speaker tag → speaker ID mapping
const TAG_MAP: Record<string, JudgeSpeaker> = {
  '[VC]':            'vc',
  '[DOMAIN_EXPERT]': 'domain_expert',
  '[USER_ADVOCATE]': 'user_advocate',
}

// Live outputTranscription chunks may be cumulative (full text so far), not
// strict deltas. Extract only new text to avoid duplicate growth and laggy UI.
function incrementalText(prev: string, next: string): string {
  const p = prev.trim()
  const n = next.trim()
  if (!n) return ''
  if (!p) return n
  if (n === p) return ''
  if (n.startsWith(p)) return n.slice(p.length).trimStart()

  // Handle partial overlap: suffix(prev) == prefix(next)
  const maxOverlap = Math.min(p.length, n.length)
  for (let i = maxOverlap; i > 0; i--) {
    if (p.slice(-i) === n.slice(0, i)) {
      return n.slice(i).trimStart()
    }
  }
  return n
}

// Render only the tail window of the active sentence so captions track the
// currently spoken words instead of freezing on sentence prefixes.
function captionTailWindow(text: string, maxChars = 120): string {
  const t = text.trim()
  if (t.length <= maxChars) return t
  const tail = t.slice(-maxChars)
  return tail.replace(/^\S+\s+/, '')
}

function parseJudgeSpeaker(text: string): { speaker: JudgeSpeaker; content: string } | null {
  const firstLine = text.split('\n')[0].trim()
  const mapped = TAG_MAP[firstLine]
  if (mapped) {
    const content = text.split('\n').slice(1).join('\n').trim()
    return { speaker: mapped, content }
  }
  // Fallback: check if tag appears inline
  for (const [tag, speaker] of Object.entries(TAG_MAP)) {
    if (text.startsWith(tag)) {
      const content = text.slice(tag.length).trim()
      return { speaker, content }
    }
  }
  return null
}

// useTurnCapture
// Processes Gemini Live server messages to extract turns and subtitles.
// Handles:
//   - outputTranscription → judge text (with speaker tag parsing)
//   - inputTranscription → founder text
//   - generation_complete → clear subtitle, deactivate ring
//   - interrupted → flush + callbacks
export function useTurnCapture({
  sessionId,
  getQaSessionId,
  sessionStartedAt,
  callbacks,
}: UseTurnCaptureOptions) {
  const sequenceRef           = useRef(0)
  const lastJudgeSpeakerRef   = useRef<JudgeSpeaker>('vc')
  const pendingJudgeRef       = useRef<{ speaker: JudgeSpeaker; content: string } | null>(null)
  const pendingFounderRef     = useRef<string>('')
  /** Current sentence fragment for the rolling display window — resets at sentence boundaries */
  const currentSentenceRef    = useRef('')
  /** Last full output-transcription content, used to compute deltas */
  const lastOutputChunkRef    = useRef('')
  const interruptionCountRef  = useRef(0)
  const closingResolveRef     = useRef<(() => void) | null>(null)
  const isFrozenRef           = useRef(false) // set after SESSION_ENDING — closing ritual must not be scored
  const [interruptionCount, setInterruptionCount] = useState(0)

  const writeTurn = useCallback(
    async (turn: Turn, seq: number, attempt = 0) => {
      if (isFrozenRef.current) return
      const qaSessionId = getQaSessionId()
      if (!qaSessionId) return
      try {
        const res = await fetch('/api/qa/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            qa_session_id: qaSessionId,
            sequence_number: seq,
            speaker: turn.speaker,
            content: turn.content,
            timestamp_offset: turn.timestampOffset,
          }),
        })
        if (!res.ok && attempt < 2) {
          await new Promise((r) => setTimeout(r, 500))
          return writeTurn(turn, seq, attempt + 1)
        }
      } catch (err) {
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 500))
          return writeTurn(turn, seq, attempt + 1)
        }
        console.error('[useTurnCapture] Turn write failed after retries:', err)
      }
    },
    [sessionId, getQaSessionId],
  )

  // Process a raw Gemini Live server message
  const processMessage = useCallback(
    (msg: unknown) => {
      const m = msg as Record<string, unknown>
      const serverContent = m?.serverContent as Record<string, unknown> | undefined
      if (!serverContent) return

      const now = Date.now()
      const offset = sessionStartedAt ? Math.max(0, now - sessionStartedAt) : 0

      // ── Handle interruption ────────────────────────────────────────
      if (serverContent.interrupted === true) {
        callbacks.onInterruption()
        callbacks.onActiveSpeakerChange(null)
        callbacks.onJudgeSubtitle(null, null)
        interruptionCountRef.current += 1
        setInterruptionCount(interruptionCountRef.current)
        pendingJudgeRef.current = null
        pendingFounderRef.current = ''
        currentSentenceRef.current = ''
        lastOutputChunkRef.current = ''
        return
      }

      // ── Judge output transcription (streaming text) ────────────────
      const outputTx = serverContent.outputTranscription as Record<string, unknown> | undefined
      if (outputTx?.text) {
        const rawText = outputTx.text as string
        const parsed = parseJudgeSpeaker(rawText)
        const speaker = parsed?.speaker ?? lastJudgeSpeakerRef.current
        const fullContent = (parsed?.content ?? rawText).trim()
        const contentDelta = incrementalText(lastOutputChunkRef.current, fullContent)
        lastOutputChunkRef.current = fullContent

        if (!contentDelta) {
          callbacks.onActiveSpeakerChange(speaker)
          const liveLine = captionTailWindow(currentSentenceRef.current)
          if (liveLine) callbacks.onJudgeSubtitle(liveLine, speaker)
          return
        }

        lastJudgeSpeakerRef.current = speaker

        // Accumulate full turn content for the DB write (unchanged)
        if (!pendingJudgeRef.current) {
          pendingJudgeRef.current = { speaker, content: contentDelta }
        } else {
          pendingJudgeRef.current = {
            speaker: pendingJudgeRef.current.speaker,
            content: (pendingJudgeRef.current.content + ' ' + contentDelta).trim(),
          }
        }

        // Rolling display sentence — append new chunk to the current fragment.
        // Only the active sentence fragment is shown; history is built sentence-by-sentence.
        currentSentenceRef.current = currentSentenceRef.current
          ? (currentSentenceRef.current + ' ' + contentDelta).trim()
          : contentDelta

        callbacks.onActiveSpeakerChange(speaker)
        callbacks.onJudgeSubtitle(captionTailWindow(currentSentenceRef.current), speaker)

        // ── Sentence boundary detection ──────────────────────────────
        // Snapshot the completed sentence to caption history, then start fresh.
        // This is the rolling-window pattern used by Google Meet / Teams / Apple.
        const trimmed = currentSentenceRef.current.trim()
        const endsWithQI     = /[?!]$/.test(trimmed)
        // Period boundary: only when fragment is long enough to rule out abbreviations
        const endsWithPeriod = /\.$/.test(trimmed) && trimmed.length > 30
        // Length rollover: prevent wall-of-text when judge speaks without punctuation
        const tooLong        = trimmed.length > 150

        if (endsWithQI || endsWithPeriod || tooLong) {
          callbacks.onSentenceComplete?.(trimmed, speaker)
          currentSentenceRef.current = ''
          // Brief gap on the live line — next chunk will restart it naturally
          callbacks.onJudgeSubtitle('', speaker)
        }
      }

      // ── Founder input transcription ───────────────────────────────
      const inputTx = serverContent.inputTranscription as Record<string, unknown> | undefined
      if (inputTx?.text) {
        pendingFounderRef.current += (inputTx.text as string) + ' '
        callbacks.onActiveSpeakerChange('founder')
      }

      // ── turn_complete — flush pending founder turn ─────────────────
      const turnComplete = serverContent.turnComplete as boolean | undefined
      if (turnComplete) {
        if (pendingFounderRef.current.trim()) {
          const turn: Turn = {
            speaker: 'founder',
            content: pendingFounderRef.current.trim(),
            timestampOffset: offset,
          }
          const seq = sequenceRef.current++
          callbacks.onTurnComplete(turn, seq)
          writeTurn(turn, seq)
          pendingFounderRef.current = ''
        }
      }

      // ── generation_complete — flush pending judge turn ─────────────
      const genComplete = serverContent.generationComplete as boolean | undefined
      if (genComplete) {
        // Flush any remaining display sentence fragment before clearing the live line
        if (currentSentenceRef.current.trim()) {
          callbacks.onSentenceComplete?.(
            currentSentenceRef.current.trim(),
            lastJudgeSpeakerRef.current,
          )
          currentSentenceRef.current = ''
        }

        callbacks.onActiveSpeakerChange(null)
        callbacks.onJudgeSubtitle(null, null)
  lastOutputChunkRef.current = ''

        if (pendingJudgeRef.current) {
          const turn: Turn = {
            speaker: pendingJudgeRef.current.speaker,
            content: pendingJudgeRef.current.content.trim(),
            timestampOffset: offset,
          }
          const seq = sequenceRef.current++
          callbacks.onTurnComplete(turn, seq)
          writeTurn(turn, seq)
          pendingJudgeRef.current = null
        }

        // Resolve any pending closing-ritual waiters
        closingResolveRef.current?.()
        closingResolveRef.current = null
      }
    },
    [callbacks, sessionStartedAt, writeTurn],
  )

  // Call before POST /api/qa/end — flushes any in-flight turn
  const flushPendingTurn = useCallback(
    async (timeoutMs = 2000): Promise<void> => {
      const deadline = Date.now() + timeoutMs
      while (pendingJudgeRef.current || pendingFounderRef.current.trim()) {
        if (Date.now() >= deadline) break
        await new Promise((r) => setTimeout(r, 100))
      }
    },
    [],
  )

  // Returns a Promise that resolves when the next generation_complete fires
  // OR after timeoutMs (whichever comes first).
  // Use during the closing ritual so the judge can finish speaking before transition.
  const waitForGenerationComplete = useCallback((timeoutMs: number): Promise<void> => {
    return new Promise((resolve) => {
      closingResolveRef.current = resolve
      setTimeout(() => {
        if (closingResolveRef.current === resolve) {
          closingResolveRef.current = null
        }
        resolve()
      }, timeoutMs)
    })
  }, [])

  const freezeTurnCapture = useCallback(() => {
    isFrozenRef.current = true
  }, [])

  return {
    processMessage,
    flushPendingTurn,
    waitForGenerationComplete,
    freezeTurnCapture,
    interruptionCount,
    sequenceCount: sequenceRef.current,
    getInterruptionCount: () => interruptionCountRef.current,
    getSequenceCount: () => sequenceRef.current,
  }
}
