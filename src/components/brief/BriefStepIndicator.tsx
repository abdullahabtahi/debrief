'use client'

interface BriefStepIndicatorProps {
  step: 1 | 2
}

export function BriefStepIndicator({ step }: BriefStepIndicatorProps) {
  return (
    <div className="flex items-center gap-2.5" aria-label={`Step ${step} of 2`}>
      <div className="flex items-center gap-1.5">
        <span
          className={`block w-1.5 h-1.5 rounded-full transition-colors ${
            step >= 1 ? 'bg-black' : 'bg-gray-300'
          }`}
        />
        <span
          className={`block w-1.5 h-1.5 rounded-full transition-colors ${
            step >= 2 ? 'bg-black' : 'bg-gray-300'
          }`}
        />
      </div>
      <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
        Step {step} of 2
      </span>
    </div>
  )
}
