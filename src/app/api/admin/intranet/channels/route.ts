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

type CreateChannelBody = {
  name: string
  description?: string | null
  is_private?: boolean
  announcements_only?: boolean
}

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return auth.res

    const body = (await req.json().catch(() => null)) as CreateChannelBody | null

    const name = String(body?.name ?? '').trim()
    const description = body?.description === undefined ? null : String(body?.description ?? '').trim() || null
    const is_private = body?.is_private === undefined ? true : Boolean(body.is_private)
    const announcements_only = body?.announcements_only === undefined ? false : Boolean(body.announcements_only)

    if (!name) {
      return NextResponse.json({ error: 'missing_name' }, { status: 400 })
    }

    const { data: channel, error: insertError } = await auth.supabase
      .from('intranet_channels')
      .insert({
        name,
        description,
        is_private,
        announcements_only,
        created_by: auth.callerId,
      })
      .select('id, name, description, is_private, announcements_only, created_at')
      .maybeSingle()

    if (insertError || !channel?.id) {
      return NextResponse.json(
        { error: 'create_failed', details: insertError?.message ?? null },
        { status: 400 }
      )
    }

    // Ensure the creating admin is a member (useful for private project channels).
    try {
      await auth.supabase
        .from('intranet_channel_members')
        .insert({ channel_id: channel.id, member_id: auth.callerId, added_by: auth.callerId })
    } catch {
      // ignore
    }

    return NextResponse.json({ ok: true, channel })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'unexpected_error', details: String(err?.message ?? err) },
      { status: 500 }
    )
  }
}
