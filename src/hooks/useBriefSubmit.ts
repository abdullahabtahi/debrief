'use client'

import { useState } from 'react'
import { useSessionStore } from '@/stores/sessionStore'

export type BriefSubmitStatus = 'idle' | 'submitting' | 'analyzing' | 'ready' | 'failed'

interface ValidationErrors {
  nameError: string | null
  contextError: string | null
}

interface UseBriefSubmitReturn {
  submit: () => Promise<boolean>
  status: BriefSubmitStatus
  setStatus: (s: BriefSubmitStatus) => void
  validation: ValidationErrors
  clearValidation: () => void
}

export function useBriefSubmit(sessionId: string): UseBriefSubmitReturn {
  const store = useSessionStore()
  const [status, setStatus] = useState<BriefSubmitStatus>('idle')
  const [validation, setValidation] = useState<ValidationErrors>({
    nameError: null,
    contextError: null,
  })

  const clearValidation = () =>
    setValidation({ nameError: null, contextError: null })

  // Returns true if submission started successfully (caller should start polling)
  const submit = async (): Promise<boolean> => {
    clearValidation()

    const { projectName, projectContext, hackathonContext, pitchDeckGcs, notesGcs, hackathonGuidelinesUrl } =
      store.briefDraft

    const errors: ValidationErrors = { nameError: null, contextError: null }

    if (!projectName || projectName.trim().length === 0) {
      errors.nameError = 'Give your project a name before submitting.'
    }
    if (!projectContext || projectContext.trim().length < 50) {
      errors.contextError =
        'Too brief. Write at least a few sentences about the problem you solved and what you built.'
    }

    if (errors.nameError || errors.contextError) {
      setValidation(errors)
      return false
    }

    setStatus('submitting')

    try {
      const res = await fetch('/api/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id:               sessionId,
          project_context:          projectContext.trim(),
          hackathon_context:        hackathonContext,
          pitch_deck_gcs:           pitchDeckGcs,
          notes_gcs:                notesGcs,
          hackathon_guidelines_url: hackathonGuidelinesUrl,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error?.message ?? 'Submission failed')
      }

      store.setIsBriefExtracting(true)
      setStatus('analyzing')
      return true
    } catch {
      setStatus('failed')
      return false
    }
  }

  return { submit, status, setStatus, validation, clearValidation }
}
