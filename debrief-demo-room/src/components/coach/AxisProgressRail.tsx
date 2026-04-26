'use client'

import { useMemo } from 'react'
import type { DebriefOutput } from '@/agents/debrief'
import type { ChatMessage } from '@/hooks/useCoachStream'

interface Props {
  debriefOutput: DebriefOutput
  messages: ChatMessage[]
}

const AXES: Array<{ key: keyof DebriefOutput['fracture_map']; label: string }> = [
  { key: 'vc', label: 'VC' },
  { key: 'domain_expert', label: 'Domain' },
  { key: 'user_advocate', label: 'User' },
]

function scoreToColor(score: number): string {
  if (score >= 7) return '#22c55e'   // green
  if (score >= 5) return '#f59e0b'   // amber
  return '#ef4444'                    // red
}

// Heuristic: has the conversation touched on this persona's concern?
function isAxisDiscussed(key: string, messages: ChatMessage[]): boolean {
  const keywords: Record<string, string[]> = {
    vc: ['vc', 'investor', 'market', 'traction', 'moat', 'revenue', 'business model', 'go-to-market'],
    domain_expert: ['technical', 'tech', 'architecture', 'implementation', 'feasibility', 'domain', 'expert'],
    user_advocate: ['user', 'customer', 'pain', 'problem', 'adoption', 'ux', 'onboarding'],
  }
  const terms = keywords[key] ?? []
  const transcript = messages
    .filter((m) => m.role === 'founder' || m.role === 'coach')
    .map((m) => m.content.toLowerCase())
    .join(' ')
  return terms.some((t) => transcript.includes(t))
}

export function AxisProgressRail({ debriefOutput, messages }: Props) {
  const axes = useMemo(
    () =>
      AXES.map(({ key, label }) => {
        const { score, top_concern } = debriefOutput.fracture_map[key] as { score: number; top_concern: string }
        const discussed = isAxisDiscussed(key as string, messages)
        return { key, label, score, top_concern, discussed }
      }),
    [debriefOutput, messages],
  )

  return (
    <div className="flex flex-col gap-3 px-4 py-4 bg-[#f5f7ff] rounded-2xl border border-[#e4eaff] w-48 shrink-0">
      <p className="text-[9px] font-semibold uppercase tracking-widest text-[#8899aa]">
        Fracture Map
      </p>

      {axes.map(({ key, label, score, top_concern, discussed }) => {
        const color = scoreToColor(score)
        const pct = Math.round((score / 10) * 100)

        return (
          <div key={key} className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-[#111c2d]">{label}</span>
              <div className="flex items-center gap-1">
                {discussed && (
                  <span className="text-[9px] text-[#22c55e] font-semibold">✓</span>
                )}
                <span className="text-[10px] font-bold" style={{ color }}>
                  {score}/10
                </span>
              </div>
            </div>

            {/* Score bar */}
            <div className="h-1.5 rounded-full bg-[#e4eaff] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>

            {/* Top concern — truncated */}
            <p className="text-[9px] text-[#8899aa] leading-tight line-clamp-2">
              {top_concern}
            </p>
          </div>
        )
      })}

      <div className="border-t border-[#e4eaff] pt-2 mt-1">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-semibold uppercase tracking-widest text-[#8899aa]">Overall</span>
          <span
            className="text-[11px] font-bold"
            style={{ color: scoreToColor(debriefOutput.fracture_map.overall_score) }}
          >
            {debriefOutput.fracture_map.overall_score}/10
          </span>
        </div>
      </div>
    </div>
  )
}
