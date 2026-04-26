'use client'

import { useEffect, useRef } from 'react'

interface PlaybackPreviewProps {
  /** Blob (Record mode) or File (Upload mode) — or a bare URL string for returning users */
  src: Blob | File | string
  /** Called when the video metadata has loaded (provides duration in seconds) */
  onDurationLoaded?: (seconds: number) => void
}

export function PlaybackPreview({ src, onDurationLoaded }: PlaybackPreviewProps) {
  const videoRef  = useRef<HTMLVideoElement>(null)
  const objectUrl = useRef<string | null>(null)

  useEffect(() => {
    if (!videoRef.current) return

    if (typeof src === 'string') {
      videoRef.current.src = src
      return
    }

    // Blob | File: create an object URL and revoke on cleanup
    const url = URL.createObjectURL(src)
    objectUrl.current = url
    videoRef.current.src = url

    return () => {
      URL.revokeObjectURL(url)
      objectUrl.current = null
    }
  }, [src])

  return (
    <div className="w-full aspect-video bg-gray-900 rounded-2xl overflow-hidden">
      <video
        ref={videoRef}
        controls
        playsInline
        className="w-full h-full object-contain"
        onLoadedMetadata={(e) => {
          const duration = (e.target as HTMLVideoElement).duration
          if (isFinite(duration) && onDurationLoaded) {
            onDurationLoaded(Math.round(duration))
          }
        }}
      />
    </div>
  )
}
