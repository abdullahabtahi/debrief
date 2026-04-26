'use client'

interface UploadProgressBarProps {
  percent: number  // 0–100
}

export function UploadProgressBar({ percent }: UploadProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, percent))

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-label="Upload progress"
      className="w-full"
    >
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-medium text-gray-500">Uploading to secure storage...</span>
        <span className="text-xs font-bold text-gray-700 tabular-nums">{Math.round(clamped)}%</span>
      </div>
      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gray-900 rounded-full origin-left transition-transform duration-300 ease-out"
          style={{ transform: `scaleX(${clamped / 100})` }}
        />
      </div>
    </div>
  )
}
