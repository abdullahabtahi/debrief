/**
 * playback-processor.js — AudioWorklet for Gemini Live audio output
 *
 * Responsibilities:
 *   1. Receive PCM 16-bit 24kHz chunks from main thread (as ArrayBuffer)
 *   2. Convert int16 → float32 in the AudioWorklet thread
 *   3. Feed samples to the output buffer with minimal latency
 *   4. Handle queue drain gracefully (output silence when buffer is empty)
 *
 * Output sample rate is 24kHz — must match the AudioContext created with
 * sampleRate: 24000, or the browser will resample automatically.
 */

class PlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this._queue = []         // Float32Array chunks waiting to play
    this._offset = 0         // read offset within the current chunk
    this._isFlushing = false

    this.port.onmessage = (event) => {
      if (event.data === 'flush') {
        // Interrupt: clear queue immediately
        this._queue = []
        this._offset = 0
        this._isFlushing = false
        return
      }
      // Received an ArrayBuffer of Int16 PCM
      const int16 = new Int16Array(event.data)
      const float32 = new Float32Array(int16.length)
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768.0
      }
      this._queue.push(float32)
    }
  }

  process(_inputs, outputs) {
    const output = outputs[0]
    if (!output || !output[0]) return true

    const channel = output[0]
    let written = 0

    while (written < channel.length) {
      if (this._queue.length === 0) {
        // Buffer underrun — fill remaining with silence
        channel.fill(0, written)
        break
      }

      const chunk = this._queue[0]
      const available = chunk.length - this._offset
      const needed = channel.length - written

      if (available <= needed) {
        // Consume this chunk entirely
        channel.set(chunk.subarray(this._offset), written)
        written += available
        this._queue.shift()
        this._offset = 0
      } else {
        // Partial consume
        channel.set(chunk.subarray(this._offset, this._offset + needed), written)
        this._offset += needed
        written += needed
      }
    }

    return true
  }
}

registerProcessor('playback-processor', PlaybackProcessor)
