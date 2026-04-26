import { useEffect, useRef, useState } from 'react'

export function usePacingTimer({ micLevel, isJudgeSpeaking }: { micLevel: number, isJudgeSpeaking: boolean }) {
  const [continuousSpeakingMs, setContinuousSpeakingMs] = useState(0)
  
  const micLevelRef = useRef(micLevel)
  const isJudgeSpeakingRef = useRef(isJudgeSpeaking)
  const lastSpokenTimestampRef = useRef<number | null>(null)
  const accumulatedMsRef = useRef(0)
  
  useEffect(() => {
    micLevelRef.current = micLevel
    isJudgeSpeakingRef.current = isJudgeSpeaking
  }, [micLevel, isJudgeSpeaking])

  useEffect(() => {
    let animationId: number
    let lastTime = performance.now()

    const checkPacing = (time: number) => {
      const delta = time - lastTime
      lastTime = time

      // If AI is speaking, reset immediately
      if (isJudgeSpeakingRef.current) {
        accumulatedMsRef.current = 0
        lastSpokenTimestampRef.current = null
        setContinuousSpeakingMs(0)
        animationId = requestAnimationFrame(checkPacing)
        return
      }

      // If user is speaking (micLevel > threshold)
      if (micLevelRef.current > 0.05) {
        lastSpokenTimestampRef.current = time
        accumulatedMsRef.current += delta
      } else {
        // If they stop speaking for > 3.5 seconds, reset
        if (lastSpokenTimestampRef.current && time - lastSpokenTimestampRef.current > 3500) {
           accumulatedMsRef.current = 0
           lastSpokenTimestampRef.current = null
        }
      }

      setContinuousSpeakingMs(accumulatedMsRef.current)
      animationId = requestAnimationFrame(checkPacing)
    }

    animationId = requestAnimationFrame(checkPacing)

    return () => cancelAnimationFrame(animationId)
  }, [])

  const warningLevel = continuousSpeakingMs > 45000 ? 'red' : continuousSpeakingMs > 30000 ? 'amber' : 'none'
  const progress = Math.min(continuousSpeakingMs / 45000, 1)

  return { warningLevel, progress, isRambling: warningLevel === 'red' }
}
