'use client'

import { cn } from '@/lib/utils'

interface PitchInputSelectorProps {
  mode:      'record' | 'upload'
  disabled:  boolean
  onChange:  (mode: 'record' | 'upload') => void
}

export function PitchInputSelector({ mode, disabled, onChange }: PitchInputSelectorProps) {
  return (
    <div role="tablist" aria-label="Pitch input method" className="flex items-center gap-1 bg-gray-100 rounded-full p-1 w-fit">
      {(['record', 'upload'] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={mode === m}
          disabled={disabled}
          onClick={() => onChange(m)}
          className={cn(
            'px-5 py-2 rounded-full text-sm font-semibold transition-all capitalize',
            mode === m
              ? 'bg-black text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-800',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          {m}
        </button>
      ))}
    </div>
  )
}
