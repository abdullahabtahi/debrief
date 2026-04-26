'use client'

import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import type { DebriefOutput } from '@/agents/debrief'

const DebriefOutputSchema = z.object({
  verdict: z.string(),
  fracture_map: z.object({
    vc:             z.object({ score: z.number(), top_concern: z.string() }),
    domain_expert:  z.object({ score: z.number(), top_concern: z.string() }),
    user_advocate:  z.object({ score: z.number(), top_concern: z.string() }),
    overall_score:  z.number(),
  }),
  strengths:          z.array(z.object({ title: z.string(), explanation: z.string() })),
  weaknesses:         z.array(z.object({ title: z.string(), explanation: z.string() })),
  narrative_issues:   z.array(z.object({ title: z.string(), evidence: z.string(), recommendation: z.string(), persona: z.string().nullable().optional() })),
  delivery_issues:    z.array(z.object({ title: z.string(), evidence: z.string(), recommendation: z.string(), persona: z.string().nullable().optional() })),
  qa_vulnerabilities: z.array(z.object({ title: z.string(), evidence: z.string(), recommendation: z.string(), persona: z.string().nullable().optional() })),
  next_drill: z.string(),
})

export interface DebriefRecord {
  id: string
  status: 'generating' | 'complete' | 'failed'
  attempt_number: number
  created_at: string
  qa_session_id: string | null
  output: DebriefOutput | null
}

export function useDebriefQuery(sessionId: string | null) {
  return useQuery<DebriefRecord | null>({
    queryKey: ['debrief', sessionId],
    queryFn: async () => {
      if (!sessionId) return null
      const res = await fetch(`/api/debrief?session_id=${sessionId}`)
      if (!res.ok) throw new Error('Failed to fetch debrief')
      const data = await res.json()
      if (!data.debrief) return null

      const { debrief } = data
      // Validate output if present — warn on mismatch but keep data rather than discarding it
      if (debrief.output) {
        const parsed = DebriefOutputSchema.safeParse(debrief.output)
        if (!parsed.success) {
          console.warn('[useDebriefQuery] output schema warning (data kept):', parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`))
          // Do NOT null out — real data is present; minor schema drift shouldn't break the UI
        }
      }
      return debrief as DebriefRecord
    },
    enabled: !!sessionId,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })
}
