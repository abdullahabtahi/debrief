/**
 * audioDiag — tagged, timestamped logging for the Q&A audio pipeline.
 *
 * Goal: capture a full trace of every state transition in the audio path
 * so we can pinpoint why audio is silent for the first few seconds and
 * then resumes mid-sentence. Filter the browser console with `[QA-AUDIO`.
 *
 * All times are relative to `markAudioStart()` (call from the click handler
 * that creates the AudioContext) so the trace is anchored to user gesture.
 */

let t0: number | null = null

export function markAudioStart(label = 'audio-start'): void {
  t0 = performance.now()
  // eslint-disable-next-line no-console
  console.log(`[QA-AUDIO T+0ms] ${label}`)
}

export function audioLog(label: string, extra?: Record<string, unknown>): void {
  const t = t0 == null ? 0 : Math.round(performance.now() - t0)
  // eslint-disable-next-line no-console
  console.log(`[QA-AUDIO T+${t}ms] ${label}`, extra ?? '')
}

export function audioWarn(label: string, extra?: Record<string, unknown>): void {
  const t = t0 == null ? 0 : Math.round(performance.now() - t0)
  // eslint-disable-next-line no-console
  console.warn(`[QA-AUDIO T+${t}ms] ${label}`, extra ?? '')
}
