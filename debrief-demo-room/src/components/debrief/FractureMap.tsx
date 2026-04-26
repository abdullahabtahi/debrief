'use client'

import { motion } from 'framer-motion'
import { scoreColor } from './scoreUtils'
import { FractureAxis } from './FractureAxis'
import type { DebriefOutput, Issue } from '@/agents/debrief'

interface Props {
  fractureMap: DebriefOutput['fracture_map']
  qaVulnerabilities?: Issue[]
}

function findEvidence(vulnerabilities: Issue[] | undefined, persona: string): string | undefined {
  if (!vulnerabilities?.length) return undefined
  const match = vulnerabilities.find((v) => v.persona === persona)
  return (match ?? vulnerabilities[0]).evidence
}

export function FractureMap({ fractureMap, qaVulnerabilities }: Props) {
  const overall = fractureMap.overall_score
  const color = scoreColor(overall)

  return (
    <div className="flex flex-col gap-8">
      {/* Overall score — appears first for tension */}
      <motion.div
        className="flex flex-col items-center gap-2"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <span className="text-xs font-semibold uppercase tracking-widest text-[#4c4546]">
          Overall Score
        </span>
        <motion.span
          className="text-5xl font-bold tracking-tight"
          style={{ color }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut', delay: 0.2 }}
        >
          {overall}
          <span className="text-lg font-medium text-[#cfc4c5]">/10</span>
        </motion.span>
      </motion.div>

      {/* 3 axes — staggered 400ms apart after 400ms hold */}
      <div className="flex flex-col gap-6">
        <FractureAxis persona="VC"            score={fractureMap.vc.score}            topConcern={fractureMap.vc.top_concern}            delay={0.8} tooltipEvidence={findEvidence(qaVulnerabilities, 'vc')} />
        <FractureAxis persona="Domain Expert" score={fractureMap.domain_expert.score} topConcern={fractureMap.domain_expert.top_concern} delay={1.2} tooltipEvidence={findEvidence(qaVulnerabilities, 'domain_expert')} />
        <FractureAxis persona="User Advocate" score={fractureMap.user_advocate.score} topConcern={fractureMap.user_advocate.top_concern} delay={1.6} tooltipEvidence={findEvidence(qaVulnerabilities, 'user_advocate')} />
      </div>
    </div>
  )
}
