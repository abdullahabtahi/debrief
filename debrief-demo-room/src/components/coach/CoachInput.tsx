'use client'

import { useRef, useEffect, KeyboardEvent } from 'react'
import { ArrowUp, Loader2 } from 'lucide-react'

const MAX_CHARS = 2000
const COUNTER_THRESHOLD = 1500

interface Props {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  disabled: boolean
  streaming?: boolean
}

export function CoachInput({ value, onChange, onSubmit, disabled, streaming }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [value])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!disabled && value.trim()) onSubmit()
    }
  }

  const remaining = MAX_CHARS - value.length
  const showCounter = value.length > COUNTER_THRESHOLD

  return (
    <div className="flex items-end gap-3">
      <div className="flex-1 relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, MAX_CHARS))}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
          placeholder={disabled ? 'Coach is thinking…' : 'Ask a follow-up question…'}
          className="w-full resize-none rounded-2xl border border-[#dee8ff] bg-white px-4 py-3 pr-12 text-sm text-[#111c2d] placeholder-[#aabbcc] focus:outline-none focus:ring-2 focus:ring-[#aabbdd] transition-colors disabled:opacity-50 disabled:cursor-not-allowed leading-relaxed"
          style={{ minHeight: '44px', maxHeight: '160px' }}
        />
        {showCounter && (
          <span
            className={`absolute bottom-3 right-3 text-[10px] tabular-nums ${
              remaining < 100 ? 'text-red-400' : 'text-[#aabbcc]'
            }`}
          >
            {remaining}
          </span>
        )}
      </div>

      <button
        onClick={onSubmit}
        disabled={disabled || !value.trim()}
        className="flex-none w-10 h-10 rounded-full bg-black text-white flex items-center justify-center hover:bg-[#222] active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
        aria-label="Send message"
      >
        {streaming ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <ArrowUp className="w-4 h-4" />
        )}
      </button>
    </div>
  )
}
