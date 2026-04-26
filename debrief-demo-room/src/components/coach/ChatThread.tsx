'use client'

import { useRef, useEffect } from 'react'
import type { ChatMessage } from '@/hooks/useCoachStream'
import { CoachMessage } from './CoachMessage'
import { FounderMessage } from './FounderMessage'
import { ContextSummaryBanner } from './ContextSummaryBanner'
import { ChatThreadSkeleton } from './ChatThreadSkeleton'

interface Props {
  messages: ChatMessage[]
  loading: boolean
}

export function ChatThread({ messages, loading }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const isNearBottom = useRef(true)

  const handleScroll = () => {
    const el = containerRef.current
    if (!el) return
    isNearBottom.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 100
  }

  // Auto-scroll when messages update, but only if user is near the bottom
  useEffect(() => {
    if (isNearBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const hasSummary = messages.some((m) => m.is_summary)

  if (loading) return <ChatThreadSkeleton />

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 min-h-0 overflow-y-auto px-10 py-8 flex flex-col gap-6"
    >
      {hasSummary && <ContextSummaryBanner />}

      {messages.map((msg) =>
        msg.role === 'coach' ? (
          <CoachMessage
            key={msg.id}
            content={msg.content}
            isStreaming={msg.isStreaming}
          />
        ) : (
          <FounderMessage key={msg.id} content={msg.content} />
        ),
      )}

      <div ref={bottomRef} className="h-px" />
    </div>
  )
}
