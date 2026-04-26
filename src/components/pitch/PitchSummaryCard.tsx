'use client'

import { Info, FileText } from 'lucide-react'
import { motion } from 'framer-motion'

interface TranscriptQuality {
  word_count:      number
  estimated_wpm?:  number
  filler_word_pct: number
}

interface PitchSummaryCardProps {
  transcriptPreview: string
  quality:           TranscriptQuality | null
}

export function PitchSummaryCard({ transcriptPreview, quality }: PitchSummaryCardProps) {
  const metrics: string[] = []
  if (quality?.estimated_wpm !== undefined) {
    metrics.push(`${quality.estimated_wpm} WPM`)
  }
  if (quality?.filler_word_pct !== undefined) {
    metrics.push(`${Math.round(quality.filler_word_pct * 100)}% filler words`)
  }
  if (quality?.word_count !== undefined) {
    metrics.push(`${quality.word_count} words`)
  }

  const showWpmHint = quality?.estimated_wpm !== undefined

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="w-full rounded-3xl border border-gray-100 bg-white p-8 flex flex-col gap-6 shadow-sm"
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-2xl bg-gray-900 flex items-center justify-center flex-shrink-0">
          <FileText size={16} className="text-white" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-gray-900">Your Pitch Transcript</h3>
          <p className="text-xs text-gray-400 mt-0.5">First 500 characters</p>
        </div>
      </div>

      <div className="bg-gray-50 rounded-2xl p-5">
        <p className="text-sm text-gray-600 leading-relaxed line-clamp-6">
          {transcriptPreview}
          {transcriptPreview.length === 500 && (
            <span className="text-gray-400"> ...</span>
          )}
        </p>
      </div>

      {metrics.length > 0 && (
        <div className="flex flex-col gap-4 border-t border-gray-100 pt-5">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Delivery Metrics</p>
          <div className="flex flex-wrap gap-2">
            {metrics.map((m, i) => (
              <motion.span
                key={m}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.06, duration: 0.2 }}
                className="px-4 py-2 rounded-full bg-gray-900 text-white text-xs font-semibold"
              >
                {m}
              </motion.span>
            ))}
          </div>
          {showWpmHint && (
            <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3">
              <Info size={13} className="text-blue-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-blue-600">
                Target pace for investor presentations is 130–150 WPM.
                {quality!.estimated_wpm! > 160 && ' You may be speaking a little fast — consider pausing more.'}
                {quality!.estimated_wpm! < 110 && ' You may be speaking slowly — this can reduce urgency.'}
              </p>
            </div>
          )}
        </div>
      )}
    </motion.div>
  )
}
