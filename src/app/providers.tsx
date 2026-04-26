'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime:    10 * 1000, // 10 seconds
            retry:        2,
            refetchOnWindowFocus: false,
          },
        },
      })
  )

  // CopilotKit provider removed — was hammering AI Studio (depleted free-tier
  // GEMINI_API_KEY) via GoogleGenerativeAIAdapter on every page load. Re-add
  // <CopilotKit runtimeUrl="/api/copilotkit"> once a paid key is in place.

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
