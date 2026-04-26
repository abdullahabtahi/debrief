/**
 * capture-processor.js — AudioWorklet for mic capture
 *
 * Responsibilities:
 *   1. Receive mic audio from the Web Audio graph (typically 44.1kHz or 48kHz, float32)
 *   2. Downsample to 16kHz (Gemini Live API input requirement)
 *   3. Convert float32 → int16 PCM (little-endian)
 *   4. Accumulate samples into 20ms frames before posting to main thread
 *      (20ms at 16kHz = 320 samples per frame)
 *
 * The resampling uses linear interpolation — sufficient quality for speech;
 * avoids heavy polyphase filter complexity in an AudioWorklet context.
 */

class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this._targetRate = 16000
    this._buffer = []          // accumulated int16 samples at 16kHz
    this._frameSize = 320      // 20ms @ 16kHz
    this._resampleRatio = null // calculated on first process() call
    this._fractionalPos = 0    // sub-sample position for linear interp
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || !input[0]) return true

    const samples = input[0] // float32, mono, native rate

    // Lazy-calculate ratio on first call once we know sampleRate from context
    if (this._resampleRatio === null) {
      this._resampleRatio = sampleRate / this._targetRate
    }

    // ── Downsample via linear interpolation ──────────────────────────────
    let pos = this._fractionalPos

    while (pos < samples.length) {
      const idx0 = Math.floor(pos)
      const idx1 = Math.min(idx0 + 1, samples.length - 1)
      const t = pos - idx0

      // Linear interpolation between adjacent samples
      const interpolated = samples[idx0] * (1 - t) + samples[idx1] * t

      // float32 [-1, 1] → int16 [-32768, 32767]
      const clamped = Math.max(-1, Math.min(1, interpolated))
      const int16 = Math.round(clamped * 32767)
      this._buffer.push(int16)

      // Flush frame when we have enough samples
      if (this._buffer.length >= this._frameSize) {
        const frame = this._buffer.splice(0, this._frameSize)
        const pcm = new Int16Array(frame)
        // Transfer the underlying ArrayBuffer for zero-copy
        this.port.postMessage(pcm.buffer, [pcm.buffer])
      }

      pos += this._resampleRatio
    }

    // Carry over fractional position into next quantum
    this._fractionalPos = pos - Math.floor(pos / this._resampleRatio) * this._resampleRatio
    // Simpler: just keep fractional part relative to the end of the buffer
    this._fractionalPos = pos - samples.length

    return true
  }
}

registerProcessor('capture-processor', CaptureProcessor)
