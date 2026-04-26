'use client'

import { useEffect, useState } from 'react'

// MobileGuard — renders a fullscreen overlay if viewport < 1024px
export function MobileGuard() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  if (!isMobile) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#f9f9ff]">
      <div className="max-w-sm px-8 text-center">
        <div className="mb-6 text-4xl">🖥️</div>
        <h2 className="mb-3 text-xl font-semibold text-[#111c2d]">Desktop Required</h2>
        <p className="text-sm leading-relaxed text-gray-500">
          Demo Day Room is designed for desktop. Please open on a device with at least 1024px
          width.
        </p>
      </div>
    </div>
  )
}
