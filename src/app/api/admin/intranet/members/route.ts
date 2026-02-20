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
