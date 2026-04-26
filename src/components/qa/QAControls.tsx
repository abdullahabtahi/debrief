'use client'

import { Mic, MicOff, PhoneOff } from 'lucide-react'

interface QAControlsProps {
  isMuted: boolean
  onToggleMute: () => void
  onEndSession: () => void
  disabled?: boolean
}

export function QAControls({ isMuted, onToggleMute, onEndSession, disabled }: QAControlsProps) {
  return (
    <div className="flex items-center justify-center gap-3 py-2">
      {/* Mute toggle */}
      <button
        onClick={onToggleMute}
        disabled={disabled}
        aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
        aria-pressed={isMuted}
        className={`w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-95 shadow-sm ${
          isMuted
            ? 'bg-red-50 text-red-500 hover:bg-red-100 ring-1 ring-red-200'
            : 'bg-white text-slate-600 hover:bg-slate-50 ring-1 ring-slate-200'
        } disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        {isMuted ? <MicOff className="w-4 h-4" aria-hidden="true" /> : <Mic className="w-4 h-4" aria-hidden="true" />}
      </button>

      {/* End Session — primary CTA */}
      <button
        onClick={onEndSession}
        disabled={disabled}
        className="flex items-center gap-2 rounded-full bg-slate-900 text-white px-7 py-3 text-sm font-semibold hover:bg-black shadow-lg shadow-slate-900/20 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <PhoneOff className="w-4 h-4" aria-hidden="true" />
        End Session
      </button>
    </div>
  )
}
