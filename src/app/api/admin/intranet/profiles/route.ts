import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const pickSupabaseAccessToken = async (req: Request) => {
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

const getAdminClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY)')
  }
  return createClient(url, serviceKey)
}

const requireAdmin = async (req: Request) => {
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

  return { ok: true as const, supabase }
}

export async function GET(req: Request) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return auth.res

    const url = new URL(req.url)
    const q = String(url.searchParams.get('q') ?? '').trim().toLowerCase()
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') ?? 200) || 200))
    const page = Math.max(0, Number(url.searchParams.get('page') ?? 0) || 0)
    const from = page * limit
    const to = from + limit - 1

    // Return alphabetical list by default.
    // Note: some deployments don't have profiles.created_at; don't order by it.
    let query = auth.supabase
      .from('profiles')
      .select('id, name, email, role, deleted_at')
      .is('deleted_at', null)

    if (q) {
      // Optional server-side filtering by email/name (case-insensitive)
      query = query.or(`email.ilike.%${q}%,name.ilike.%${q}%`)
    }

    query = query
      .order('name', { ascending: true, nullsFirst: false })
      .order('email', { ascending: true, nullsFirst: false })
      .range(from, to)

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ error: 'query_failed', details: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true, profiles: data ?? [], page, limit, nextPage: (data?.length ?? 0) === limit ? page + 1 : null })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'unexpected_error', details: String(err?.message ?? err) },
      { status: 500 }
    )
  }
}
