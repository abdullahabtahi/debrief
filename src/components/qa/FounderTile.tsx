'use client'

import { useEffect, useRef, useState } from 'react'
import { ActiveSpeakerRing } from './ActiveSpeakerRing'

interface FounderTileProps {
  isActiveSpeaker: boolean
  micLevel: number // 0-1
}

export function FounderTile({ isActiveSpeaker, micLevel }: FounderTileProps) {
  const videoRef       = useRef<HTMLVideoElement>(null)
  const [granted, setGranted] = useState<'pending' | 'granted' | 'denied'>('pending')

  useEffect(() => {
    let stream: MediaStream | null = null

    const requestCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
        setGranted('granted')
      } catch {
        setGranted('denied')
      }
    }

    requestCamera()

    return () => {
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return (
    <div className="relative w-full h-full bg-[#111c2d] rounded-3xl overflow-hidden flex items-center justify-center">
      {granted === 'granted' ? (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="w-full h-full object-cover scale-x-[-1]" // mirror selfie
        />
      ) : (
        /* Avatar fallback */
        <div className="flex flex-col items-center gap-3">
          <div className="w-20 h-20 rounded-full bg-gray-700 flex items-center justify-center text-2xl font-semibold text-white">
            F
          </div>
          {granted === 'denied' && (
            <p className="text-xs text-gray-400">Camera access denied</p>
          )}
        </div>
      )}

      {/* Active speaker ring overlay */}
      <div className="absolute inset-0 rounded-3xl pointer-events-none">
        <ActiveSpeakerRing isActive={isActiveSpeaker} color="#22c55e" size="lg" />
      </div>

      {/* Mic VAD ring */}
      {micLevel > 0.15 && (
        <span
          className="absolute inset-0 rounded-3xl pointer-events-none border-2 border-emerald-400 transition-opacity"
          style={{ opacity: Math.min(micLevel, 1) * 0.8 }}
        />
      )}

      {/* Label */}
      <div className="absolute bottom-3 left-4 bg-black/50 backdrop-blur-sm rounded-full px-3 py-1">
        <span className="text-white text-xs font-medium">You</span>
      </div>
    </div>
  )
}
