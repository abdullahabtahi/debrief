'use client'

import { cn } from '@/lib/utils'

interface Props {
  label: string
  onClick: () => void
  disabled?: boolean
  variant?: 'primary' | 'secondary'
  className?: string
}

// CTAButton — the one dominant call-to-action per screen
export function CTAButton({ label, onClick, disabled = false, variant = 'primary', className }: Props) {
  if (!label) return null

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded-full px-8 py-3 text-sm font-semibold transition-all',
        variant === 'primary' && !disabled && 'bg-black text-white hover:bg-gray-800',
        variant === 'primary' && disabled  && 'cursor-not-allowed bg-gray-200 text-gray-400',
        variant === 'secondary' && 'border border-gray-200 bg-white text-[#111c2d] hover:bg-gray-50',
        className,
      )}
    >
      {label}
    </button>
  )
}
