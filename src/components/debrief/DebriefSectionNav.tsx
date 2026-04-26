'use client'

import { cn } from '@/lib/utils'

const SECTIONS = [
  { id: 'verdict',           label: 'Verdict' },
  { id: 'fracture-map',      label: 'Fracture Map' },
  { id: 'strengths',         label: 'Strengths' },
  { id: 'weaknesses',        label: 'Weaknesses' },
  { id: 'narrative-issues',  label: 'Narrative' },
  { id: 'delivery-issues',   label: 'Delivery' },
  { id: 'qa-vulnerabilities',label: 'Q&A Gaps' },
  { id: 'next-drill',        label: 'Next Drill' },
]

interface Props {
  arrivedSections: Set<string>
  activeSection: string | null
}

export function DebriefSectionNav({ arrivedSections, activeSection }: Props) {
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <nav className="sticky top-[120px] z-40 flex items-center gap-2 py-5 mb-8 overflow-x-auto no-scrollbar bg-white/95 backdrop-blur-sm border-b border-[#dee8ff] -mx-8 px-8">
      {SECTIONS.map((s) => {
        const arrived = arrivedSections.has(s.id)
        const active  = activeSection === s.id
        return (
          <button
            key={s.id}
            onClick={() => arrived && scrollTo(s.id)}
            disabled={!arrived}
            className={cn(
              'rounded-full px-4 py-1.5 text-xs font-semibold whitespace-nowrap transition-all',
              arrived
                ? active
                  ? 'bg-black text-white'
                  : 'bg-white text-gray-700 border border-gray-200 hover:border-gray-400'
                : 'bg-gray-100 text-gray-300 cursor-not-allowed border border-transparent',
            )}
          >
            {s.label}
          </button>
        )
      })}
    </nav>
  )
}
