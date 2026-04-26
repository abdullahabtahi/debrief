'use client'

import { CTAButton } from '@/components/shell/CTAButton'

interface Props {
  questionCount: number
  onStart: () => void
  loading?: boolean
}

export function DebriefTriggerCard({ questionCount, onStart, loading = false }: Props) {
  return (
    <div className="bg-white rounded-3xl p-8 flex flex-col gap-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
        Your Debrief is Ready
      </p>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-gray-900 leading-snug">
          3 judges. {questionCount} questions.<br />Here&rsquo;s what they found.
        </h1>
        <p className="text-sm text-gray-500">
          Get your fracture map — where your pitch held and where it cracked.
        </p>
      </div>
      <div className="pt-2">
        <CTAButton label={loading ? 'Generating…' : 'Get Debrief'} onClick={onStart} disabled={loading} />
      </div>
    </div>
  )
}
