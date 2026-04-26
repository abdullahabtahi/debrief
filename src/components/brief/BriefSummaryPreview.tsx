'use client'

import { Edit2 } from 'lucide-react'

interface ProjectSummary {
  problem:            string
  solution:           string
  target_user:        string
  key_differentiator: string
  tech_stack_hint:    string
  team_size_hint:     string
}

interface HackathonSummary {
  event_name:        string
  theme:             string
  judging_criteria:  string[]
  constraints:       string[]
  prizes:            string[]
}

interface BriefSummaryPreviewProps {
  projectSummary:   ProjectSummary | null
  hackathonSummary: HackathonSummary | null
  onEditBrief:      () => void
}

const PROJECT_ITEMS: { key: keyof ProjectSummary; title: string; hint: string }[] = [
  { key: 'problem',            title: 'The Problem',        hint: 'Identify the core issue.' },
  { key: 'solution',           title: 'Solution & Insight', hint: 'Propose the solution.' },
  { key: 'target_user',        title: 'Target User',        hint: 'Who is this built for?' },
  { key: 'key_differentiator', title: 'Differentiator',     hint: 'Why this approach?' },
]

const METADATA_ITEMS: { key: keyof ProjectSummary; label: string }[] = [
  { key: 'tech_stack_hint', label: 'Tech Stack' },
  { key: 'team_size_hint',  label: 'Team Size'  },
]

export function BriefSummaryPreview({
  projectSummary,
  hackathonSummary,
  onEditBrief,
}: BriefSummaryPreviewProps) {
  if (!projectSummary) return null

  const metaItems = METADATA_ITEMS.filter(
    (m) => projectSummary[m.key] && String(projectSummary[m.key]).trim()
  )

  return (
    <div className="flex flex-col gap-10 mt-6">

      {/* Header row with edit action */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          Brief extracted
        </p>
        <button
          type="button"
          onClick={onEditBrief}
          className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:text-black"
        >
          <Edit2 size={13} />
          Edit Context
        </button>
      </div>

      {/* Main extracted fields */}
      {PROJECT_ITEMS.map((item, idx) => {
        const val = projectSummary[item.key]
        if (!val) return null

        return (
          <div
            key={item.key}
            className={idx > 0 ? 'border-t border-gray-100 pt-10' : ''}
          >
            <div className="flex flex-col gap-1.5 mb-3">
              <h2 className="text-xl font-bold text-gray-900">{item.title}</h2>
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">
                {item.hint}
              </p>
            </div>
            <p className="text-sm leading-relaxed text-gray-600">{String(val)}</p>
          </div>
        )
      })}

      {/* Metadata pills: tech stack + team size */}
      {metaItems.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-6">
          {metaItems.map((m) => (
            <span
              key={m.key}
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600"
            >
              <span className="text-gray-400">{m.label}:</span>
              {String(projectSummary[m.key])}
            </span>
          ))}
        </div>
      )}

      {/* Hackathon summary (criteria) */}
      {hackathonSummary && hackathonSummary.judging_criteria?.length > 0 && (
        <div className="border-t border-gray-100 pt-10">
          <div className="flex flex-col gap-1.5 mb-4">
            <h2 className="text-xl font-bold text-gray-900">Judging Criteria</h2>
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">
              What the room rewards
            </p>
          </div>
          <ul className="flex flex-col gap-2">
            {hackathonSummary.judging_criteria.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400" />
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
