'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { useSessionStore } from '@/stores/sessionStore'
import { useBriefSubmit } from '@/hooks/useBriefSubmit'
import { BriefStepIndicator } from './BriefStepIndicator'
import { ExtractionProgress } from './ExtractionProgress'
import { PDFUploadZone } from './PDFUploadZone'
import { CTAButton } from '@/components/shell/CTAButton'

interface HackathonBriefFormProps {
  sessionId: string
}

export function HackathonBriefForm({ sessionId }: HackathonBriefFormProps) {
  const router = useRouter()
  const store  = useSessionStore()
  const { submit, status, setStatus, validation } = useBriefSubmit(sessionId)

  const [localContext, setLocalContext] = useState(store.briefDraft.hackathonContext)

  // Keep store in sync so ProjectBriefForm can also read hackathon context
  useEffect(() => {
    store.setBriefDraft({ hackathonContext: localContext })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localContext])

  const handleSubmit = async () => {
    const ok = await submit()
    if (ok) {
      // Extraction started — navigate to project page which shows ExtractionProgress
      // and runs the polling query to completion
      router.push(`/session/${sessionId}/brief/project`)
    }
  }

  // ── Extraction in-progress view ───────────────────────────────────────────
  if (status === 'analyzing') {
    return <ExtractionProgress />
  }

  // ── Form view ─────────────────────────────────────────────────────────────
  const isDisabled = status === 'submitting'

  return (
    <div className="flex flex-col gap-8">
      <BriefStepIndicator step={2} />

      {(validation.nameError || validation.contextError) && (
        <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {validation.nameError
            ? 'Go back and give your project a name before submitting.'
            : 'Go back and add more detail to your project context (50+ characters required).'}
          <button
            type="button"
            onClick={() => router.push(`/session/${sessionId}/brief/project`)}
            className="ml-2 underline font-semibold hover:no-underline"
          >
            Back to Project Context
          </button>
        </div>
      )}

      {status === 'failed' && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Extraction failed. Your context is saved. Try again.
          <button
            type="button"
            onClick={() => setStatus('idle')}
            className="ml-2 underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label
          htmlFor="hackathon-context"
          className="text-sm font-semibold text-gray-800 flex items-center justify-between"
        >
          Context &amp; Judging Criteria
          <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">
            Strongly recommended
          </span>
        </label>
        <textarea
          id="hackathon-context"
          name="hackathonContext"
          value={localContext}
          onChange={(e) => setLocalContext(e.target.value)}
          placeholder="Paste the hackathon brief, judging rubric, or event theme. Knowing what the room rewards tells the judges where to push hardest. Even a rough description is enough."
          disabled={isDisabled}
          className="w-full resize-y rounded-2xl border border-gray-200 bg-gray-50/50 p-6 text-[15px] leading-relaxed text-gray-800 placeholder:text-gray-400 focus:border-black focus:bg-white focus:ring-1 focus:ring-black outline-none transition-all min-h-[320px] disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold text-gray-800 flex items-center justify-between">
          Event guidelines PDF
          <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Optional</span>
        </label>
        <PDFUploadZone
          label="Hackathon Guidelines"
          sessionId={sessionId}
          fileType="hackathon_guidelines"
          currentGcsPath={store.briefDraft.hackathonGuidelinesGcs}
          currentFilename={store.briefDraft.hackathonGuidelinesFilename}
          onUploadComplete={(path, filename) => {
            store.setBriefDraft({ hackathonGuidelinesGcs: path, hackathonGuidelinesFilename: filename })
          }}
          onRemove={() => {
            store.setBriefDraft({ hackathonGuidelinesGcs: null, hackathonGuidelinesFilename: null })
          }}
        />
        <p className="text-xs text-gray-400 leading-relaxed">
          Upload the official event brief or rubric. The judges will use it to calibrate what this room actually rewards.
        </p>
      </div>

      <div className="flex justify-between items-center pt-2">
        <button
          type="button"
          onClick={() => router.push(`/session/${sessionId}/brief/project`)}
          className="flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ChevronLeft className="size-4" />
          Back to Project Context
        </button>
        <CTAButton
          label={status === 'submitting' ? 'Saving…' : 'Brief the judges →'}
          onClick={handleSubmit}
          disabled={isDisabled}
        />
      </div>
    </div>
  )
}
