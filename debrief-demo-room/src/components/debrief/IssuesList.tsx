'use client'

import { motion } from 'framer-motion'
import { PersonaTag } from './scoreUtils'
import type { Issue } from '@/agents/debrief'

interface Props {
  title: string
  hint: string
  issues: Issue[]
  emptyText?: string
}

export function IssuesList({ title, hint, issues, emptyText = 'No issues flagged in this category.' }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <div className="flex flex-col gap-1.5 mb-4">
        <h2 className="text-xl font-bold text-[#111c2d]">{title}</h2>
        <p className="text-xs text-[#4c4546] uppercase tracking-wide font-medium">{hint}</p>
      </div>
      {issues.length === 0 ? (
        <p className="text-sm text-[#4c4546] italic">{emptyText}</p>
      ) : (
        <ul className="flex flex-col gap-6">
          {issues.map((issue, i) => (
            <li key={i} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-[#111c2d]">{issue.title}</p>
                {issue.persona && <PersonaTag persona={issue.persona} />}
              </div>
              <blockquote className="border-l-2 border-[#cfc4c5] pl-3 text-sm italic text-[#4c4546] leading-relaxed">
                {issue.evidence}
              </blockquote>
              <p className="text-sm text-[#4c4546] leading-relaxed">
                <span className="font-medium text-[#111c2d]">Fix: </span>
                {issue.recommendation}
              </p>
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  )
}
