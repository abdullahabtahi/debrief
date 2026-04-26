'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useSessionStore } from '@/stores/sessionStore'
import { HackathonBriefForm } from '@/components/brief/HackathonBriefForm'

export default function BriefHackathonPage() {
  const { id } = useParams<{ id: string }>()
  const setActiveSubView = useSessionStore((s) => s.setActiveSubView)

  useEffect(() => {
    setActiveSubView('hackathon')
  }, [setActiveSubView])

  return (
    <div className="w-full h-full flex flex-col pt-8">
      <div className="bg-white rounded-3xl p-10 shadow-sm border border-gray-100 flex flex-col gap-8 w-full">
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">Hackathon Context</h2>
          <p className="text-[15px] text-gray-500 leading-relaxed">Every hackathon scores differently. Paste the criteria here so the judges know what this room actually rewards.</p>
        </div>
        <HackathonBriefForm sessionId={id} />
      </div>
    </div>
  )
}
