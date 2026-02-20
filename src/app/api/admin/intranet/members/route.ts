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

  return { ok: true as const, supabase, callerId: user.id }
}

type Body = {
  channel_id: string
  action: 'add' | 'remove'
  email?: string
  member_id?: string
}

export async function GET(req: Request) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return auth.res

    const url = new URL(req.url)
    const channel_id = String(url.searchParams.get('channel_id') ?? '').trim()
    if (!channel_id) {
      return NextResponse.json({ error: 'missing_channel_id' }, { status: 400 })
    }

    const { data: members, error: membersError } = await auth.supabase
      .from('intranet_channel_members')
      .select('member_id, created_at')
      .eq('channel_id', channel_id)

    if (membersError) {
      return NextResponse.json({ error: 'members_query_failed', details: membersError.message }, { status: 400 })
    }

    const ids = (members ?? []).map((m: any) => String(m.member_id)).filter(Boolean)
    let profiles: any[] = []
    if (ids.length > 0) {
      const { data: profs, error: profError } = await auth.supabase
        .from('profiles')
        .select('id, name, email, role, deleted_at')
        .in('id', ids)

      if (profError) {
        return NextResponse.json({ error: 'profiles_query_failed', details: profError.message }, { status: 400 })
      }
      profiles = profs ?? []
    }

    const byId = new Map<string, any>(profiles.map((p: any) => [String(p.id), p]))
    const result = (members ?? []).map((m: any) => {
      const pid = String(m.member_id)
      const p = byId.get(pid) ?? null
      return {
        member_id: pid,
        created_at: String(m.created_at ?? ''),
        profile: p
          ? {
              id: String(p.id),
              name: p.name === null || p.name === undefined ? null : String(p.name),
              email: p.email === null || p.email === undefined ? null : String(p.email),
              role: String(p.role ?? 'employee'),
              deleted_at: p.deleted_at === null || p.deleted_at === undefined ? null : String(p.deleted_at),
            }
          : null,
      }
    })

    return NextResponse.json({ ok: true, members: result })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'unexpected_error', details: String(err?.message ?? err) },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return auth.res

    const body = (await req.json().catch(() => null)) as Body | null
    const channel_id = String(body?.channel_id ?? '').trim()
    const action = body?.action

    if (!channel_id || (action !== 'add' && action !== 'remove')) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
    }

    let memberId = String(body?.member_id ?? '').trim()

    if (!memberId) {
      const email = String(body?.email ?? '').trim().toLowerCase()
      if (!email) return NextResponse.json({ error: 'missing_member' }, { status: 400 })

      const { data: profile, error } = await auth.supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle()

      if (error) {
        return NextResponse.json({ error: 'profile_lookup_failed', details: error.message }, { status: 500 })
      }
      if (!profile?.id) {
        return NextResponse.json({ error: 'unknown_email' }, { status: 404 })
      }
      memberId = String(profile.id)
    }

    if (action === 'add') {
      const { error } = await auth.supabase
        .from('intranet_channel_members')
        .insert({ channel_id, member_id: memberId, added_by: auth.callerId })

      if (error) {
        // ignore duplicate inserts
        if (!String(error.message ?? '').toLowerCase().includes('duplicate')) {
          return NextResponse.json({ error: 'add_failed', details: error.message }, { status: 400 })
        }
      }

      return NextResponse.json({ ok: true })
    }

    const { error } = await auth.supabase
      .from('intranet_channel_members')
      .delete()
      .eq('channel_id', channel_id)
      .eq('member_id', memberId)

    if (error) {
      return NextResponse.json({ error: 'remove_failed', details: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'unexpected_error', details: String(err?.message ?? err) },
      { status: 500 }
    )
  }
}
