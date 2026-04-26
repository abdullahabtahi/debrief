'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useSessionStore } from '@/stores/sessionStore'
import { ProjectBriefForm } from '@/components/brief/ProjectBriefForm'

export default function BriefProjectPage() {
  const { id } = useParams<{ id: string }>()
  const setActiveSubView = useSessionStore((s) => s.setActiveSubView)

  useEffect(() => {
    setActiveSubView('project')
  }, [setActiveSubView])

  return (
    <div className="w-full h-full flex flex-col pt-8">
      <div className="bg-white rounded-3xl p-10 shadow-sm border border-gray-100 flex flex-col gap-8 w-full">
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">Project Context</h2>
          <p className="text-[15px] text-gray-500 leading-relaxed">The judges read this before you say a word. Tell them what you built, what problem it solves, and who has that problem. The sharper your context, the harder they will push on the gaps.</p>
        </div>
        <ProjectBriefForm sessionId={id} />
      </div>
    </div>
  )
}
