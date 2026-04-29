'use client'

import { useState, useRef, useCallback } from 'react'
import { Upload, CheckCircle, X, AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PDFUploadZoneProps {
  label: string
  sessionId: string
  fileType: 'pitch_deck' | 'notes' | 'hackathon_guidelines'
  onUploadComplete: (gcsPath: string, filename: string) => void
  onRemove: () => void
  currentGcsPath: string | null
  currentFilename: string | null
}

type UploadState = 'idle' | 'uploading' | 'done' | 'error'

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20 MB

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function filenameFromGcsPath(path: string): string {
  return path.split('/').pop() ?? path
}

export function PDFUploadZone({
  label,
  sessionId,
  fileType,
  onUploadComplete,
  onRemove,
  currentGcsPath,
  currentFilename,
}: PDFUploadZoneProps) {
  // Restore 'done' state when mounting with an already-uploaded file
  const [state, setState]           = useState<UploadState>(currentGcsPath ? 'done' : 'idle')
  const [error, setError]           = useState<string | null>(null)
  const [filename, setFilename]     = useState<string | null>(
    currentFilename ?? (currentGcsPath ? filenameFromGcsPath(currentGcsPath) : null)
  )
  const [fileSize, setFileSize]     = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const inputRef                    = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (file: File) => {
    setError(null)

    if (!file.name.toLowerCase().endsWith('.pdf') || file.type !== 'application/pdf') {
      setError('Only PDF files are accepted')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setError(`File too large (max 20 MB)`)
      return
    }

    setFilename(file.name)
    setFileSize(file.size)
    setState('uploading')

    try {
      const res = await fetch('/api/brief/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id:   sessionId,
          file_type:    fileType,
          content_type: 'application/pdf',
        }),
      })

      if (!res.ok) throw new Error('Failed to get upload URL')
      const { upload_url, gcs_path } = await res.json()

      if (upload_url) {
        const uploadRes = await fetch(upload_url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/pdf' },
          body: file,
        })
        if (!uploadRes.ok) throw new Error('Upload to GCS failed')
      }

      setState('done')
      onUploadComplete(gcs_path, file.name)
    } catch {
      setState('error')
      setError('Upload failed. Click to retry.')
    }
  }, [sessionId, fileType, onUploadComplete])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation()
    setState('idle')
    setFilename(null)
    setFileSize(null)
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
    onRemove()
  }

  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation()
    setState('idle')
    setError(null)
    inputRef.current?.click()
  }

  if (state === 'done' && filename) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm transition-all hover:border-gray-300">
        <CheckCircle className="size-5 shrink-0 text-emerald-500" />
        <div className="min-w-0 flex-1 flex flex-col items-start text-left">
          <p className="truncate text-sm font-bold text-gray-900 max-w-[120px]">{filename}</p>
          {fileSize !== null && (
            <p className="text-xs text-gray-500 font-medium">{formatBytes(fileSize)}</p>
          )}
        </div>
        <button
          type="button"
          onClick={handleRemove}
          className="rounded-full bg-gray-100 p-2 text-gray-600 transition hover:bg-gray-200 hover:text-black"
          aria-label="Remove file"
        >
          <X className="size-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <label
        htmlFor={`pdf-upload-${fileType}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        aria-label={`Upload ${label} PDF`}
        className={cn(
          'flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-8 transition-all',
          isDragging
            ? 'border-gray-400 bg-gray-100/50'
            : state === 'error'
              ? 'border-red-300 bg-red-50'
              : 'border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50',
          state === 'uploading' && 'cursor-not-allowed opacity-70',
        )}
      >
        {state === 'uploading' ? (
          <Loader2 className="size-5 animate-spin text-gray-400" />
        ) : state === 'error' ? (
          <AlertCircle className="size-5 text-red-400" />
        ) : (
          <Upload className="size-5 text-gray-400" />
        )}
        <span className="text-sm text-gray-500">
          {state === 'uploading'
            ? 'Uploading…'
            : state === 'error'
              ? 'Retry upload'
              : `${label} (PDF, max 20 MB)`}
        </span>
      </label>
      {error && state !== 'error' && (
        <p className="text-xs text-red-500" role="alert">{error}</p>
      )}
      {state === 'error' && (
        <button
          type="button"
          onClick={handleRetry}
          className="text-xs text-red-600 underline hover:no-underline"
        >
          {error}
        </button>
      )}
      <input
        ref={inputRef}
        id={`pdf-upload-${fileType}`}
        type="file"
        accept="application/pdf"
        disabled={state === 'uploading'}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
      />
    </div>
  )
}
