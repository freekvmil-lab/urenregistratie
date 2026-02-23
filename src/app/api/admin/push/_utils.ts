import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

export const pickSupabaseAccessToken = async (req: Request) => {
  const authHeader = req.headers.get('authorization')
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1]
  }

  const cookieStore = await cookies()
  const authCookie = cookieStore
    .getAll()
    .find((c) => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'))

  if (!authCookie) return undefined

  try {
    const session = JSON.parse(decodeURIComponent(authCookie.value))
    return session?.access_token
  } catch {
    return undefined
  }
}

export const getAdminClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY)')
  }
  return createClient(url, serviceKey)
}

export const requireAdmin = async (req: Request) => {
  const supabaseAccessToken = await pickSupabaseAccessToken(req)
  if (!supabaseAccessToken) {
    return { ok: false as const, res: NextResponse.json({ error: 'not_authenticated' }, { status: 401 }) }
  }

  const supabase = getAdminClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(supabaseAccessToken)

  if (userError || !user) {
    return { ok: false as const, res: NextResponse.json({ error: 'not_authenticated' }, { status: 401 }) }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    return { ok: false as const, res: NextResponse.json({ error: 'profile_lookup_failed' }, { status: 500 }) }
  }

  if (profile?.role !== 'admin') {
    return { ok: false as const, res: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  }

  return { ok: true as const, supabase, callerId: user.id }
}

export const jsonError = (error: string, status: number, details?: any) =>
  NextResponse.json({ error, details: details ?? null }, { status })
