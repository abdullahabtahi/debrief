'use client'

import { motion } from 'framer-motion'
import { Search } from 'lucide-react'

const TOOL_LABELS: Record<string, string> = {
  get_project_brief: 'Reading project brief…',
  get_hackathon_brief: 'Reading hackathon criteria…',
  get_pitch_transcript: 'Reading pitch transcript…',
  get_qa_turns: 'Reading Q&A session…',
}

interface Props {
  toolName: string
}

export function CoachToolCallBubble({ toolName }: Props) {
  const label = TOOL_LABELS[toolName] ?? `Checking ${toolName}…`

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2 }}
      className="flex items-center gap-2 px-4 py-2 bg-[#f0f4ff] border border-[#dde5ff] rounded-xl w-fit max-w-xs"
    >
      <Search className="w-3 h-3 text-[#7b93d3] shrink-0 animate-pulse" />
      <span className="text-[11px] text-[#505f76] leading-none">{label}</span>
    </motion.div>
  )
}
