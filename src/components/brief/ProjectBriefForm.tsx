'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { useSessionStore } from '@/stores/sessionStore'
import { useBriefSubmit } from '@/hooks/useBriefSubmit'
import { PDFUploadZone } from './PDFUploadZone'
import { BriefStepIndicator } from './BriefStepIndicator'
import { ExtractionProgress } from './ExtractionProgress'
import { BriefSummaryPreview } from './BriefSummaryPreview'
import { CTAButton } from '@/components/shell/CTAButton'

const MIN_CONTEXT_CHARS = 50

interface ProjectBriefFormProps {
  sessionId: string
}

export function ProjectBriefForm({ sessionId }: ProjectBriefFormProps) {
  const router = useRouter()
  const store  = useSessionStore()
  const { submit, status, setStatus, validation } = useBriefSubmit(sessionId)

  // Local mirrors of Zustand draft — keep store in sync on every change
  const [projectName, setProjectName] = useState(store.briefDraft.projectName)
  const [localContext, setLocalContext] = useState(store.briefDraft.projectContext)
  // isEditing = user clicked "Edit Context" from the summary view
  const [isEditing, setIsEditing] = useState(false)

  // Determine if we are in an extracting state (from this page or navigated from hackathon page)
  const isBriefExtracting = useSessionStore((s) => s.isBriefExtracting)
  const isAnalyzing = status === 'analyzing' || isBriefExtracting
  const isBriefReady = store.sessionState === 'brief_ready'

  // Sync name changes to store immediately (so hackathon page can read them for submission)
  useEffect(() => {
    store.setBriefDraft({ projectName })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectName])

  // Sync context changes to store
  useEffect(() => {
    store.setBriefDraft({ projectContext: localContext })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localContext])

  // If we navigated here while extraction is in-progress, force analyzing status
  useEffect(() => {
    if (isBriefExtracting && status === 'idle') {
      setStatus('analyzing')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBriefExtracting])

  // Poll session state during extraction
  const { data: sessionData } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: async () => {
      const res = await fetch(`/api/sessions/${sessionId}`)
      if (!res.ok) throw new Error('Failed to fetch session')
      return res.json()
    },
    enabled: isAnalyzing,
    refetchInterval: (query) => {
      if (!isAnalyzing) return false
      if (query.state.data?.state === 'brief_ready') return false
      return 3000
    },
  })

  // React to polling result
  useEffect(() => {
    if (!sessionData) return
    if (sessionData.state === 'brief_ready') {
      store.setSessionState('brief_ready')
      store.setIsBriefExtracting(false)
      setStatus('ready')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionData])

  // Fetch active brief for summary display
  const { data: activeBrief } = useQuery({
    queryKey: ['active-brief', sessionId],
    queryFn: async () => {
      const res = await fetch(`/api/brief?session_id=${sessionId}`)
      if (!res.ok) return null
      return res.json()
    },
    enabled: isBriefReady || status === 'ready',
  })

  // CTA handler depends on whether hackathon context is already filled
  const hackathonFilled = store.briefDraft.hackathonContext.trim().length > 0
  const handleCTA = async () => {
    if (!hackathonFilled) {
      // Validate before navigating to hackathon page
      if (!projectName.trim() || localContext.trim().length < MIN_CONTEXT_CHARS) return
      router.push(`/session/${sessionId}/brief/hackathon`)
      return
    }
    // Hackathon context is filled — submit directly
    const ok = await submit()
    if (ok) setIsEditing(false)
  }

  const handleEditBrief = () => {
    // Show the form without reverting the session state machine —
    // states are forward-only; the DB still reflects brief_ready.
    setIsEditing(true)
    setStatus('idle')
    store.setIsBriefExtracting(false)
  }

  // ── Summary view (brief_ready, not editing) ───────────────────────────────────────
  if (!isEditing && (isBriefReady || status === 'ready') && activeBrief?.project_brief?.extracted_summary) {
    return (
      <div className="space-y-6">
        <BriefSummaryPreview
          projectSummary={activeBrief.project_brief.extracted_summary}
          hackathonSummary={activeBrief.hackathon_brief?.extracted_summary ?? null}
          onEditBrief={handleEditBrief}
        />
        <CTAButton
          label="Go to Room →"
          onClick={() => router.push(`/session/${sessionId}/room/pitch`)}
        />
      </div>
    )
  }

  // ── Extraction in-progress view ───────────────────────────────────────────
  if (isAnalyzing) {
    return <ExtractionProgress />
  }

  // ── Form view ─────────────────────────────────────────────────────────────
  const contextChars = localContext.trim().length
  const contextValid = contextChars >= MIN_CONTEXT_CHARS
  const isDisabled   = status === 'submitting'

  return (
    <div className="space-y-5">
      <BriefStepIndicator step={1} />

      {status === 'failed' && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
        >
          Extraction hit an error. Your context is saved. Try again.
          <button
            type="button"
            onClick={() => setStatus('idle')}
            className="ml-auto text-xs underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Project name */}
      <div className="flex flex-col gap-2">
        <label
          htmlFor="project-name"
          className="text-sm font-semibold text-gray-800 flex items-center justify-between"
        >
          Project name
          <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Required</span>
        </label>
        <input
          id="project-name"
          name="projectName"
          type="text"
          autoComplete="off"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          onBlur={async () => {
            const name = projectName.trim()
            if (!name) return
            store.setActiveSessionTitle(name)
            await fetch(`/api/sessions/${sessionId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: name }),
            })
          }}
          placeholder="What is this project called?"
          maxLength={120}
          disabled={isDisabled}
          className="w-full rounded-2xl border border-gray-200 bg-gray-50/50 px-6 py-4 text-[15px] text-gray-800 placeholder:text-gray-400 focus:border-black focus:bg-white focus:ring-1 focus:ring-black outline-none transition-all disabled:cursor-not-allowed disabled:opacity-50"
        />
        {validation.nameError && (
          <p role="alert" className="text-xs text-red-500 font-medium">{validation.nameError}</p>
        )}
      </div>

      {/* Project context */}
      <div className="flex flex-col gap-2">
        <label
          htmlFor="project-context"
          className="text-sm font-semibold text-gray-800 flex items-center justify-between"
        >
          Project context
          <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Required</span>
        </label>
        <textarea
          id="project-context"
          name="projectContext"
          value={localContext}
          onChange={(e) => setLocalContext(e.target.value)}
          placeholder="Describe what you built and why it matters. Lead with the problem. Who has it, how bad is it, and what did you ship to fix it. Paste a README, a Devpost draft, or write it raw. The more specific you are, the harder the judges will push on the gaps."
          disabled={isDisabled}
          className="w-full resize-y rounded-2xl border border-gray-200 bg-gray-50/50 p-6 text-[15px] leading-relaxed text-gray-800 placeholder:text-gray-400 focus:border-black focus:bg-white focus:ring-1 focus:ring-black outline-none transition-all min-h-[320px] disabled:cursor-not-allowed disabled:opacity-50"
        />
        {/* Character counter */}
        <div className="flex items-center justify-between">
          {validation.contextError ? (
            <p role="alert" className="text-xs text-red-500 font-medium">{validation.contextError}</p>
          ) : (
            <span />
          )}
          <span className={`text-xs font-mono tabular-nums ${
            contextValid ? 'text-gray-400' : contextChars > 0 ? 'text-amber-500' : 'text-gray-300'
          }`}>
            {contextChars} / {MIN_CONTEXT_CHARS} min
          </span>
        </div>
      </div>

      {/* PDF uploads */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold text-gray-800 flex items-center justify-between">
          Supporting files
          <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Optional</span>
        </label>
        <div className="grid grid-cols-2 gap-6">
          <PDFUploadZone
            label="Pitch Deck"
            sessionId={sessionId}
            fileType="pitch_deck"
            currentGcsPath={store.briefDraft.pitchDeckGcs}
            currentFilename={store.briefDraft.pitchDeckFilename}
            onUploadComplete={(path, filename) => {
              store.setBriefDraft({ pitchDeckGcs: path, pitchDeckFilename: filename })
            }}
            onRemove={() => {
              store.setBriefDraft({ pitchDeckGcs: null, pitchDeckFilename: null })
            }}
          />
          <PDFUploadZone
            label="Additional Notes"
            sessionId={sessionId}
            fileType="notes"
            currentGcsPath={store.briefDraft.notesGcs}
            currentFilename={store.briefDraft.notesFilename}
            onUploadComplete={(path, filename) => {
              store.setBriefDraft({ notesGcs: path, notesFilename: filename })
            }}
            onRemove={() => {
              store.setBriefDraft({ notesGcs: null, notesFilename: null })
            }}
          />
        </div>
      </div>

      {/* CTA */}
      <div className="pt-4 flex justify-end">
        <CTAButton
          label={
            status === 'submitting'
              ? 'Saving…'
              : hackathonFilled
                ? 'Brief the judges →'
                : 'Continue to Hackathon Context →'
          }
          onClick={handleCTA}
          disabled={isDisabled || (!projectName.trim()) || (!contextValid)}
        />
      </div>
    </div>
  )
}
