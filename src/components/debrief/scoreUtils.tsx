// Score-to-label utility — labels are NEVER emitted by the agent
export function scoreToLabel(score: number): 'Critical' | 'Developing' | 'Adequate' | 'Strong' {
  if (score <= 3) return 'Critical'
  if (score <= 5) return 'Developing'
  if (score <= 7) return 'Adequate'
  return 'Strong'
}

export function scoreColor(score: number): string {
  if (score <= 3) return '#ef4444'
  if (score <= 5) return '#f59e0b'
  if (score <= 7) return '#eab308'
  return '#22c55e'
}

const LABEL_CLASSES: Record<string, string> = {
  Critical:   'bg-red-50 text-red-600 border-red-200',
  Developing: 'bg-amber-50 text-amber-600 border-amber-200',
  Adequate:   'bg-yellow-50 text-yellow-600 border-yellow-200',
  Strong:     'bg-green-50 text-green-600 border-green-200',
}

export function ScoreLabelBadge({ score }: { score: number }) {
  const label = scoreToLabel(score)
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${LABEL_CLASSES[label]}`}>
      {label}
    </span>
  )
}

const PERSONA_LABELS: Record<string, string> = {
  vc: 'VC',
  domain_expert: 'Domain Expert',
  user_advocate: 'User Advocate',
}

export function PersonaTag({ persona }: { persona: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[#cfc4c5] bg-[#f0f3ff] px-2.5 py-0.5 text-[10px] font-semibold text-[#505f76]">
      {PERSONA_LABELS[persona] ?? persona}
    </span>
  )
}
