import { NextResponse } from 'next/server'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { generateSessionCode } from '@/lib/utils'
import { rateLimit, getClientIp, tooManyRequests } from '@/lib/rateLimit'

// POST /api/sessions — create a new session
export async function POST(req: Request) {
  const ip = getClientIp(req)
  const rl = rateLimit(`sessions-create:${ip}`, 5, 60) // 5 sessions / min / IP
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec)

  // Attempt insert with collision retry (unique constraint on session_code)
  for (let attempt = 0; attempt < 2; attempt++) {
    const session_code = generateSessionCode()

    const { data, error } = await supabase
      .from('sessions')
      .insert({ session_code, state: 'draft' })
      .select('id, session_code')
      .single()

    if (error) {
      // Postgres unique violation code
      if (error.code === '23505') continue
      return NextResponse.json(
        { error: { code: 'DB_ERROR', message: 'Failed to create session', details: [error.message] } },
        { status: 500 }
      )
    }

    return NextResponse.json({ id: data.id, session_code: data.session_code }, { status: 201 })
  }

  return NextResponse.json(
    { error: { code: 'COLLISION', message: 'Session code collision. Please try again.' } },
    { status: 500 }
  )
}
