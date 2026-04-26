'use client'

import { useState, useEffect } from 'react'
import { AlertCircle } from 'lucide-react'
import { AnimatePresence } from 'framer-motion'
import { useCoachStream } from '@/hooks/useCoachStream'
import { ChatThread } from './ChatThread'
import { OpeningPromptChips } from './OpeningPromptChips'
import { CoachInput } from './CoachInput'
import { AxisProgressRail } from './AxisProgressRail'
import { CoachToolCallBubble } from './CoachToolCallBubble'
import type { DebriefOutput } from '@/agents/debrief'

interface Props {
  sessionId: string
}

export function CoachView({ sessionId }: Props) {
  const [inputValue, setInputValue] = useState('')
  const [debriefOutput, setDebriefOutput] = useState<DebriefOutput | null>(null)

  const { messages, loading, streaming, activeToolCall, openingPrompts, hasFounderMessages, error, send } =
    useCoachStream(sessionId)

  // Fetch debrief output for AxisProgressRail
  useEffect(() => {
    if (!sessionId) return
    fetch(`/api/debrief?session_id=${encodeURIComponent(sessionId)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.output) setDebriefOutput(data.output as DebriefOutput)
      })
      .catch(() => {})
  }, [sessionId])

  // NOTE: CopilotKit suggestion hooks (useCopilotChatSuggestions / useCopilotReadable)
  // were removed — they routed through GoogleGenerativeAIAdapter (AI Studio API),
  // which is on a depleted free-tier key. Re-enable once a paid AI Studio key or
  // Vertex-backed adapter is wired up.

  const handleSubmit = () => {
    if (!inputValue.trim() || streaming) return
    send(inputValue.trim())
    setInputValue('')
  }

  const handleChipSelect = (prompt: string) => {
    if (streaming) return
    send(prompt)
  }

  return (
    <div className="w-full flex gap-4 pt-8 flex-1 min-h-0">
      {/* Main chat card */}
      <div className="bg-white rounded-3xl shadow-sm border border-[#dee8ff] flex flex-col flex-1 min-h-0 overflow-hidden">

        {/* Header */}
        <div className="px-10 pt-10 pb-6 border-b border-[#f0f3ff] flex-none">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#8899aa] mb-1">
            Phase 4
          </p>
          <h2 className="text-xl font-bold text-[#111c2d] leading-snug">Coach</h2>
          <p className="text-sm text-[#505f76] mt-1 leading-relaxed">
            Drill on your weakest areas with direct, evidence-based coaching.
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-10 mt-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex-none">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-none" />
            <p className="text-xs text-red-700 leading-snug">{error}</p>
          </div>
        )}

        {/* Chat thread — scrollable */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <ChatThread messages={messages} loading={loading} />

          {/* Tool call progress bubble */}
          <AnimatePresence>
            {activeToolCall && (
              <div className="px-10 pb-2 flex-none">
                <CoachToolCallBubble toolName={activeToolCall.toolName} />
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Opening prompt chips (fade out after first founder message) */}
        {openingPrompts.length > 0 && !loading && (
          <OpeningPromptChips
            prompts={openingPrompts}
            visible={!hasFounderMessages && !streaming}
            onSelect={handleChipSelect}
          />
        )}

        {/* Input area */}
        <div className="px-10 pb-10 pt-4 border-t border-[#f0f3ff] flex-none">
          <CoachInput
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSubmit}
            disabled={streaming || loading}
            streaming={streaming}
          />
          <p className="text-[10px] text-[#aabbcc] mt-2 text-center">
            Shift + Enter for new line
          </p>
        </div>
      </div>

      {/* Fracture map rail — only when debrief loaded */}
      {debriefOutput && (
        <AxisProgressRail debriefOutput={debriefOutput} messages={messages} />
      )}
    </div>
  )
}

