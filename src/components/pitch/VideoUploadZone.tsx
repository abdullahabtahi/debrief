'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Upload, Film, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const ACCEPTED_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']
const MAX_BYTES = 500 * 1024 * 1024 // 500 MB

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

interface VideoUploadZoneProps {
  file:             File | null
  durationSeconds:  number | null
  onFileSelected:   (file: File) => void
  onDurationLoaded: (seconds: number) => void
  onClear:          () => void
}

export function VideoUploadZone({
  file,
  durationSeconds,
  onFileSelected,
  onDurationLoaded,
  onClear,
}: VideoUploadZoneProps) {
  const inputRef    = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [durationObjectUrl, setDurationObjectUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!file) { setDurationObjectUrl(null); return }
    const url = URL.createObjectURL(file)
    setDurationObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const validate = useCallback((f: File): string | null => {
    if (!ACCEPTED_TYPES.includes(f.type)) {
      return 'Only MP4, WebM, or MOV video files are accepted'
    }
    if (f.size > MAX_BYTES) {
      return 'File too large (max 500 MB)'
    }
    return null
  }, [])

  const handleFile = useCallback((f: File) => {
    const err = validate(f)
    if (err) { setError(err); return }
    setError(null)
    onFileSelected(f)
  }, [validate, onFileSelected])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
    // Reset so the same file can be re-selected after clearing
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  if (file) {
    return (
      <div className="w-full rounded-2xl border border-gray-200 bg-gray-50 p-5 flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center flex-shrink-0">
          <Film size={18} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">{file.name}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {formatBytes(file.size)}
            {durationSeconds !== null && ` · ${formatDuration(durationSeconds)}`}
            {durationSeconds !== null && durationSeconds < 30 && (
              <span className="ml-1 text-amber-500">(very short — are you sure?)</span>
            )}
            {durationSeconds !== null && durationSeconds > 300 && (
              <span className="ml-1 text-amber-500">(over 5 min — judges expect 3 min)</span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-400 hover:text-red-500 hover:border-red-300 transition-all flex-shrink-0"
          aria-label="Remove file"
        >
          <X size={14} />
        </button>
        {/* Hidden video element to extract duration — object URL managed by useEffect */}
        {durationObjectUrl && (
          <video
            className="hidden"
            src={durationObjectUrl}
            onLoadedMetadata={(e) => {
              const dur = (e.target as HTMLVideoElement).duration
              if (isFinite(dur)) onDurationLoaded(Math.round(dur))
            }}
          />
        )}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'w-full aspect-video border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-4 cursor-pointer transition-all',
        dragging ? 'border-gray-400 bg-gray-100' : 'border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100'
      )}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
    >
      <div className="w-14 h-14 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-sm">
        <Upload size={24} className="text-gray-400" />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-gray-700">Drop your video here</p>
        <p className="text-xs text-gray-400 mt-1">MP4, WebM, or MOV · max 500 MB</p>
      </div>
      {error && (
        <p className="text-xs text-red-500 font-medium px-4 text-center">{error}</p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        className="hidden"
        onChange={handleInputChange}
      />
    </div>
  )
}
