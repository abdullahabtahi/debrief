'use client'

import { Info } from 'lucide-react'

export function ContextSummaryBanner() {
  return (
    <div className="mx-10 mb-2 flex items-center gap-2 bg-[#f0f3ff] border border-[#dee8ff] rounded-xl px-4 py-2.5">
      <Info className="w-3.5 h-3.5 text-[#6677aa] flex-none" />
      <p className="text-xs text-[#505f76] leading-snug">
        Earlier parts of this conversation have been summarised to keep the context focused.
      </p>
    </div>
  )
}
