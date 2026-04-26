import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'

const QuerySchema = z.object({
  code: z
    .string()
    .regex(/^[A-Z]{2}-[A-Z0-9]{4}$/, 'Invalid session code format'),
})

// GET /api/sessions/recover?code=BR-4X9K
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const parsed = QuerySchema.safeParse({ code: searchParams.get('code') })

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_CODE',
          message: 'Session not found. Check the code and try again.',
          details: parsed.error.issues,
        },
      },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('sessions')
    .select('id, session_code, state')
    .eq('session_code', parsed.data.code)
    .single()

  if (error || !data) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Session not found. Check the code and try again.' } },
      { status: 404 }
    )
  }

  return NextResponse.json({ id: data.id, session_code: data.session_code, state: data.state })
}
