'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useSessionStore } from '@/stores/sessionStore'
import { JudgeBriefLoader, type JudgeSummary } from '@/lib/judgeDataLoader'
import { getTrafficLight, getReadinessLevel, type ReadinessLevel } from '@/lib/judgeLogic'

export default function JudgeBriefPage() {
  const { id } = useParams<{ id: string }>()
  const setActiveSubView = useSessionStore((s) => s.setActiveSubView)
  const [data, setData] = useState<JudgeSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setActiveSubView('judge')
  }, [setActiveSubView])

  useEffect(() => {
    JudgeBriefLoader(id).then((result) => {
      setData(result)
      setLoading(false)
    })
  }, [id])

  if (loading) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center rounded-3xl bg-white p-8 text-center shadow-sm">
        <p className="text-gray-500">Loading intelligence analysis...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center rounded-3xl bg-white p-8 text-center shadow-sm">
        <h2 className="mb-2 text-xl font-semibold text-gray-900">No Judge Brief Available</h2>
        <p className="text-gray-500">Wait for your project context to be extracted before viewing the judge brief.</p>
      </div>
    )
  }

  // Simple heuristic for "Readiness Score" traffic lights
  const dimensions = [
    { label: 'Data Strategy',    val: data.data_strategy },
    { label: 'Competitive Moat', val: data.competitive_moat },
    { label: 'Market Validation', val: data.market_validation },
    { label: 'Failure Modes',    val: data.failure_modes },
  ]

  const readiness = getReadinessLevel(dimensions)

  const readinessBadge: Record<ReadinessLevel, { label: string; className: string }> = {
    ready:      { label: 'Ready for Room', className: 'bg-green-100 text-green-800' },
    caution:    { label: 'Caution',        className: 'bg-amber-100 text-amber-800' },
    vulnerable: { label: 'Vulnerable',     className: 'bg-red-100 text-red-800' },
  }

  return (
    <div className="w-full h-full flex flex-col pt-8 animate-in fade-in slide-in-from-bottom-4">
      <div className="bg-white rounded-3xl p-10 shadow-sm border border-gray-100 flex flex-col w-full">
        <div className="mb-8">
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">Judge Briefing Document</h2>
          <p className="mt-2 text-[15px] text-gray-500 leading-relaxed">This is what the AI judges know about your startup before you say a word. Check your blind spots before you enter the room.</p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-200">
          <div className="border-b border-gray-200 bg-gray-50 px-8 py-4 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Readiness Assessment</h3>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-500">Overall:</span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${readinessBadge[readiness].className}`}>
                {readinessBadge[readiness].label}
              </span>
            </div>
          </div>

          <div className="divide-y divide-gray-100 bg-white">
            {dimensions.map((dim, i) => {
              const lightColor = getTrafficLight(dim.val)
              return (
                <div key={i} className="px-8 py-6 flex items-start gap-4">
                  <div className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${lightColor} shadow-sm`} />
                  <div className="flex-1">
                    <p className="mb-1 text-[15px] font-semibold text-gray-900">{dim.label}</p>
                    <p className="text-[15px] text-gray-600 leading-relaxed">{dim.val}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
