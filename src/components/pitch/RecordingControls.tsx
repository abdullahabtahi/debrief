'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Square, RotateCcw, Video } from 'lucide-react'
import { cn } from '@/lib/utils'

type RecordingState = 'idle' | 'countdown' | 'recording' | 'done'

interface RecordingControlsProps {
  state:           RecordingState
  recordingSeconds: number        // elapsed seconds while recording
  onStart:         () => void     // triggers PreRecordingCountdown
  onStop:          () => void
  onReRecord:      () => void
}

export function RecordingControls({
  state,
  recordingSeconds,
  onStart,
  onStop,
  onReRecord,
}: RecordingControlsProps) {
  return (
    <AnimatePresence mode="wait">
      {state === 'idle' && (
        <motion.button
          key="start"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.18 }}
          type="button"
          onClick={onStart}
          className="flex items-center gap-3 px-8 py-4 rounded-full bg-black text-white font-semibold text-sm hover:bg-gray-800 transition-colors shadow-lg shadow-black/10"
        >
          <Video size={16} />
          Start Recording
        </motion.button>
      )}

      {state === 'recording' && (
        <motion.div
          key="recording"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.18 }}
          className="flex items-center gap-4"
        >
          {/* Pulse indicator */}
          <div className="flex items-center gap-2">
            <motion.div
              className="w-2.5 h-2.5 rounded-full bg-red-500"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
            />
            <span className="text-sm text-gray-600 font-medium tabular-nums">
              {String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:
              {String(recordingSeconds % 60).padStart(2, '0')} elapsed
            </span>
          </div>

          {/* Stop */}
          <button
            type="button"
            onClick={onStop}
            className={cn(
              'flex items-center gap-2.5 px-7 py-3.5 rounded-full font-semibold text-sm transition-all',
              'bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-500/20',
            )}
          >
            <Square size={14} className="fill-white" />
            Stop Recording
          </button>
        </motion.div>
      )}

      {state === 'done' && (
        <motion.button
          key="rerecord"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22 }}
          type="button"
          onClick={onReRecord}
          className="flex items-center gap-2 px-6 py-3 rounded-full border border-gray-200 bg-white text-gray-600 font-medium text-sm hover:bg-gray-50 hover:border-gray-300 transition-all"
        >
          <RotateCcw size={14} />
          Re-record
        </motion.button>
      )}
    </AnimatePresence>
  )
}
