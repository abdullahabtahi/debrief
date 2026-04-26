'use client'

import { useEffect, useRef } from 'react'

interface VideoPreviewProps {
  stream: MediaStream | null
}

export function VideoPreview({ stream }: VideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  return (
    <div className="relative w-full aspect-video bg-gray-900 rounded-2xl overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="w-full h-full object-cover scale-x-[-1]"
      />
      {!stream && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <div className="w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5">
              <path d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
            </svg>
          </div>
          <p className="text-gray-400 text-sm">Camera initialising...</p>
        </div>
      )}
    </div>
  )
}
