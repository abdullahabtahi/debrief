'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { DebriefOutput } from '@/agents/debrief'
import { VerdictCard } from './VerdictCard'
import { FractureMap } from './FractureMap'
import { FindingsList } from './FindingsList'
import { IssuesList } from './IssuesList'
import { NextDrillCard } from './NextDrillCard'
import { DebriefSectionNav } from './DebriefSectionNav'
import { CTAButton } from '@/components/shell/CTAButton'
import { useRouter } from 'next/navigation'

interface Props {
  sessionId: string
  output: Partial<DebriefOutput>
  isInterrupted?: boolean
  onRerun?: () => void
}

const SECTION_ID_MAP: Partial<Record<keyof DebriefOutput, string>> = {
  verdict:            'verdict',
  fracture_map:       'fracture-map',
  strengths:          'strengths',
  weaknesses:         'weaknesses',
  narrative_issues:   'narrative-issues',
  delivery_issues:    'delivery-issues',
  qa_vulnerabilities: 'qa-vulnerabilities',
  next_drill:         'next-drill',
}

export function DebriefStreamingView({ sessionId, output, isInterrupted = false, onRerun }: Props) {
  const router = useRouter()

  const [arrivedSections, setArrivedSections] = useState<Set<string>>(new Set())
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const isComplete = !!output.next_drill

  // Track which sections have arrived as output prop updates
  useEffect(() => {
    const newArrived = new Set<string>()
    for (const [key, sectionId] of Object.entries(SECTION_ID_MAP)) {
      if (output[key as keyof DebriefOutput] !== undefined) {
        newArrived.add(sectionId!)
      }
    }
    setArrivedSections(newArrived)
  }, [output])

  // IntersectionObserver for active section highlight — with cleanup
  const observersRef = useRef<Map<string, IntersectionObserver>>(new Map())
  const observeSection = useCallback((el: HTMLElement | null, id: string) => {
    // Disconnect existing observer for this id before creating a new one
    observersRef.current.get(id)?.disconnect()
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setActiveSection(id) },
      { threshold: 0.3 },
    )
    obs.observe(el)
    observersRef.current.set(id, obs)
  }, [])

  // Disconnect all observers on unmount
  useEffect(() => {
    const observers = observersRef.current
    return () => { observers.forEach((obs) => obs.disconnect()) }
  }, [])

  return (
    <div className="flex flex-col gap-4">

      {isInterrupted && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 flex items-start gap-3">
          <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-500" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">Debrief incomplete</p>
            <p className="text-xs text-amber-600 mt-0.5">This session was interrupted. Results may be partial.</p>
          </div>
          {onRerun && (
            <button
              onClick={onRerun}
              className="text-xs font-semibold text-amber-800 underline whitespace-nowrap"
            >
              Re-run Debrief
            </button>
          )}
        </div>
      )}

      <div className="bg-white rounded-3xl px-8 pb-8 flex flex-col gap-0 shadow-[0_8px_48px_0_rgba(17,28,45,0.05)] border border-[#dee8ff]">

        <DebriefSectionNav arrivedSections={arrivedSections} activeSection={activeSection} />

        {output.verdict && (
          <div id="verdict" ref={(el) => observeSection(el, 'verdict')}>
            <VerdictCard verdict={output.verdict} />
          </div>
        )}

        {output.fracture_map && (
          <div id="fracture-map" ref={(el) => observeSection(el, 'fracture-map')} className="border-t border-[#dee8ff] pt-10 mt-10">
            <div className="flex flex-col gap-1.5 mb-6">
              <h2 className="text-xl font-bold text-gray-900">Fracture Map</h2>
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Where each judge pushed back</p>
            </div>
            <FractureMap fractureMap={output.fracture_map} qaVulnerabilities={output.qa_vulnerabilities} />
          </div>
        )}

        {output.strengths && (
          <div id="strengths" ref={(el) => observeSection(el, 'strengths')} className="border-t border-[#dee8ff] pt-10 mt-10">
            <FindingsList type="strength" findings={output.strengths} />
          </div>
        )}

        {output.weaknesses && (
          <div id="weaknesses" ref={(el) => observeSection(el, 'weaknesses')} className="border-t border-[#dee8ff] pt-10 mt-10">
            <FindingsList type="weakness" findings={output.weaknesses} />
          </div>
        )}

        {output.narrative_issues && (
          <div id="narrative-issues" ref={(el) => observeSection(el, 'narrative-issues')} className="border-t border-[#dee8ff] pt-10 mt-10">
            <IssuesList title="Narrative Issues" hint="Storyline & structure" issues={output.narrative_issues} emptyText="No narrative issues identified." />
          </div>
        )}

        {output.delivery_issues && (
          <div id="delivery-issues" ref={(el) => observeSection(el, 'delivery-issues')} className="border-t border-[#dee8ff] pt-10 mt-10">
            <IssuesList title="Delivery Issues" hint="Pacing, clarity, filler words" issues={output.delivery_issues} emptyText="No delivery issues identified." />
          </div>
        )}

        {output.qa_vulnerabilities && (
          <div id="qa-vulnerabilities" ref={(el) => observeSection(el, 'qa-vulnerabilities')} className="border-t border-[#dee8ff] pt-10 mt-10">
            <IssuesList title="Q&A Vulnerabilities" hint="Questions you couldn't answer" issues={output.qa_vulnerabilities} emptyText="No Q&A vulnerabilities — judges didn't surface questions." />
          </div>
        )}

      </div>

      {output.next_drill && (
        <div id="next-drill" ref={(el) => observeSection(el, 'next-drill')}>
          <NextDrillCard nextDrill={output.next_drill} />
        </div>
      )}

      {isComplete && (
        <div className="flex items-center justify-between pt-2">
          <CTAButton label="Talk to Coach" onClick={() => router.push(`/session/${sessionId}/debrief/coach`)} />
          {onRerun && (
            <button
              onClick={onRerun}
              className="text-sm text-[#4c4546] hover:text-[#111c2d] underline transition-colors"
            >
              Re-run Debrief
            </button>
          )}
        </div>
      )}
    </div>
  )
}
