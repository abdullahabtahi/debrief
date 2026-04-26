import {
  CopilotRuntime,
  GoogleGenerativeAIAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from '@copilotkit/runtime'
import { NextRequest } from 'next/server'

const runtime = new CopilotRuntime()

export const POST = async (req: NextRequest) => {
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter: new GoogleGenerativeAIAdapter({
      model: 'gemini-2.0-flash',
      apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY,
    }),
    endpoint: '/api/copilotkit',
  })
  return handleRequest(req)
}
