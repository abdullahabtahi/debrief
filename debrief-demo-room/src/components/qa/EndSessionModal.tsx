'use client'

import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'

interface EndSessionModalProps {
  isOpen: boolean
  turnCount: number
  isClosing: boolean
  onConfirm: () => void
  onCancel: () => void
}

const SUGGESTED_MIN_TURNS = 6

export function EndSessionModal({
  isOpen,
  turnCount,
  isClosing,
  onConfirm,
  onCancel,
}: EndSessionModalProps) {
  const isTooShort = turnCount < SUGGESTED_MIN_TURNS
  const primaryBtnRef = useRef<HTMLButtonElement>(null)

  // Focus primary button on open; Escape dismisses
  useEffect(() => {
    if (!isOpen) return
    const frame = requestAnimationFrame(() => {
      primaryBtnRef.current?.focus()
    })
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isClosing) onCancel()
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', handleKey)
    }
  }, [isOpen, isClosing, onCancel])

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            aria-hidden="true"
          />

          {/* Dialog */}
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="end-session-title"
            className="fixed inset-0 flex items-center justify-center z-50 p-6"
          >
            <motion.div
              className="bg-white rounded-3xl p-8 w-full max-w-md shadow-xl"
              initial={{ scale: 0.95, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 16 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="end-session-title" className="text-lg font-semibold text-[#111c2d]">End session?</h2>

              {isTooShort ? (
                <div className="mt-3 flex gap-3 items-start bg-amber-50 rounded-2xl p-4">
                  <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="text-sm text-amber-800 font-medium">
                      Only {turnCount} exchange{turnCount !== 1 ? 's' : ''} so far
                    </p>
                    <p className="text-sm text-amber-700 mt-1">
                      Founders who complete 8–10 turns receive significantly richer debrief data.
                      Stay a bit longer?
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-gray-500">
                  Ending will finalize your Q&amp;A and unlock your debrief report.
                </p>
              )}

              <div className="mt-6 flex gap-3">
                {isTooShort ? (
                  <>
                    <button
                      ref={primaryBtnRef}
                      onClick={onCancel}
                      disabled={isClosing}
                      className="flex-1 rounded-full bg-black text-white py-3 text-sm font-semibold hover:bg-gray-900 transition-all disabled:opacity-40"
                    >
                      Continue Session
                    </button>
                    <button
                      onClick={onConfirm}
                      disabled={isClosing}
                      className="flex-1 rounded-full border border-red-300 text-red-600 py-3 text-sm font-medium hover:bg-red-50 transition-all disabled:opacity-40"
                    >
                      {isClosing ? 'Ending...' : 'End Anyway'}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={onCancel}
                      disabled={isClosing}
                      className="flex-1 rounded-full border border-gray-200 text-gray-700 py-3 text-sm font-medium hover:bg-gray-50 transition-all disabled:opacity-40"
                    >
                      Cancel
                    </button>
                    <button
                      ref={primaryBtnRef}
                      onClick={onConfirm}
                      disabled={isClosing}
                      className="flex-1 rounded-full bg-black text-white py-3 text-sm font-semibold hover:bg-gray-900 transition-all disabled:opacity-40"
                    >
                      {isClosing ? 'Ending...' : 'End Session'}
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
