'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSessionStore } from '@/stores/sessionStore'
import type { SessionState } from '@/stores/sessionStore'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string
  role: 'founder' | 'coach'
  content: string
  sequence_number: number
  is_summary: boolean
  created_at?: string
  // Transient — only present while streaming
  isStreaming?: boolean
}

export interface ActiveToolCall {
  toolName: string
  toolCallId: string
}

interface UseCoachStreamResult {
  messages: ChatMessage[]
  loading: boolean
  streaming: boolean
  activeToolCall: ActiveToolCall | null
  openingPrompts: string[]
  hasFounderMessages: boolean
  error: string | null
  send: (message: string) => void
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useCoachStream(sessionId: string): UseCoachStreamResult {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [streaming, setStreaming] = useState(false)
  const [activeToolCall, setActiveToolCall] = useState<ActiveToolCall | null>(null)
  const [openingPrompts, setOpeningPrompts] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const debriefIdRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const initFiredRef = useRef(false)

  const setSessionState = useSessionStore((s) => s.setSessionState)

  // ── Fetch history on mount ────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return

    setLoading(true)
    setError(null)
    initFiredRef.current = false

    fetch(`/api/coach/messages?session_id=${encodeURIComponent(sessionId)}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data?.error?.message ?? `HTTP ${res.status}`)
        }
        return res.json()
      })
      .then(async (data: { debrief_id: string; messages: ChatMessage[]; coach_opening_prompts: string[] | null }) => {
        debriefIdRef.current = data.debrief_id
        const FALLBACK_PROMPTS = [
          'What should I focus on most before demo day?',
          'Which judge concern was most serious?',
          'How do I improve my overall score?',
        ]
        setOpeningPrompts(data.coach_opening_prompts ?? FALLBACK_PROMPTS)

        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages)
          setLoading(false)
        } else {
          // No messages — coach hasn't opened yet. Fire __init__ to start the session.
          setLoading(false)
          if (!initFiredRef.current) {
            initFiredRef.current = true
            await streamMessage('__init__', true, data.debrief_id)
          }
        }
      })
      .catch((err: Error) => {
        console.error('[useCoachStream] fetch history error', err)
        setError(err.message)
        setLoading(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  // ── Core streaming function ───────────────────────────────────────────────
  const streamMessage = useCallback(
    async (messageText: string, isInit: boolean, explicitDebriefId?: string) => {
      const dId = explicitDebriefId ?? debriefIdRef.current
      if (!dId) {
        setError('Debrief ID not resolved. Please refresh.')
        return
      }

      setStreaming(true)
      setError(null)

      const streamingMsgId = crypto.randomUUID()

      // Optimistic founder message (not for __init__)
      if (!isInit) {
        const optimisticFounder: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'founder',
          content: messageText,
          sequence_number: Date.now(), // placeholder — overwritten on next mount
          is_summary: false,
        }
        setMessages((prev) => [...prev, optimisticFounder])
      }

      // Streaming coach placeholder
      const streamingPlaceholder: ChatMessage = {
        id: streamingMsgId,
        role: 'coach',
        content: '',
        sequence_number: Date.now() + 1,
        is_summary: false,
        isStreaming: true,
      }
      setMessages((prev) => [...prev, streamingPlaceholder])

      abortRef.current?.abort()
      abortRef.current = new AbortController()

      try {
        const res = await fetch('/api/coach', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            debrief_id: dId,
            message: messageText,
          }),
          signal: abortRef.current.signal,
        })

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          throw new Error(errData?.error?.message ?? `HTTP ${res.status}`)
        }

        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const event = JSON.parse(line.slice(6)) as {
                type: string
                delta?: string
                state?: string
                toolName?: string
                toolCallId?: string
              }

              if (event.type === 'TOOL_CALL_START' && event.toolName) {
                setActiveToolCall({ toolName: event.toolName, toolCallId: event.toolCallId ?? '' })
              }

              if (event.type === 'TOOL_CALL_END') {
                setActiveToolCall(null)
              }

              if (event.type === 'TEXT_MESSAGE_CONTENT' && event.delta) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === streamingMsgId
                      ? { ...m, content: m.content + event.delta }
                      : m,
                  ),
                )
              }

              if (event.type === 'STATE_UPDATE' && event.state) {
                setSessionState(event.state as SessionState)
              }

              if (event.type === 'RUN_FINISHED') {
                setActiveToolCall(null)
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === streamingMsgId ? { ...m, isStreaming: false } : m,
                  ),
                )
              }
            } catch {
              // Ignore malformed SSE lines
            }
          }
        }
      } catch (err) {
        const isAbort = (err as Error).name === 'AbortError'
        if (!isAbort) {
          console.error('[useCoachStream] stream error', err)
          setError((err as Error).message)
        }
        // Always clean up the streaming placeholder on any error or abort
        setMessages((prev) => prev.filter((m) => m.id !== streamingMsgId))
      } finally {
        setStreaming(false)
        setActiveToolCall(null)
      }
    },
    [sessionId, setSessionState],
  )

  // ── Public send ───────────────────────────────────────────────────────────
  const send = useCallback(
    (messageText: string) => {
      if (!messageText.trim() || streaming) return
      streamMessage(messageText.trim(), false)
    },
    [streaming, streamMessage],
  )

  const hasFounderMessages = messages.some((m) => m.role === 'founder' && !m.isStreaming)

  return { messages, loading, streaming, activeToolCall, openingPrompts, hasFounderMessages, error, send }
}
