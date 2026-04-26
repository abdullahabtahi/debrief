import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

// Server-side client — uses service_role key, bypasses RLS.
// Never expose this client to the browser.
// Lazy-initialized so the build doesn't fail when env vars are absent.
export function getSupabase(): SupabaseClient {
  if (_client) return _client

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables')
  }

  _client = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  return _client
}

// Convenience re-export for callers that prefer `supabase.from(...)`
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabase() as unknown as Record<string | symbol, unknown>)[prop]
  },
})
