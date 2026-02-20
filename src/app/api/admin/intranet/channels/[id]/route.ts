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

type PatchBody = {
  name?: string
  description?: string | null
  is_private?: boolean
  announcements_only?: boolean
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return auth.res

    const { id } = await ctx.params
    const channelId = String(id ?? '').trim()
    if (!channelId) return NextResponse.json({ error: 'missing_id' }, { status: 400 })

    const body = (await req.json().catch(() => null)) as PatchBody | null

    const patch: any = {}
    if (body?.name !== undefined) patch.name = String(body.name ?? '').trim()
    if (body?.description !== undefined) patch.description = body.description === null ? null : String(body.description ?? '').trim() || null
    if (body?.is_private !== undefined) patch.is_private = Boolean(body.is_private)
    if (body?.announcements_only !== undefined) patch.announcements_only = Boolean(body.announcements_only)

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'no_changes' }, { status: 400 })
    }

    if (patch.name !== undefined && !patch.name) {
      return NextResponse.json({ error: 'missing_name' }, { status: 400 })
    }

    const { data, error } = await auth.supabase
      .from('intranet_channels')
      .update({ ...patch })
      .eq('id', channelId)
      .select('id, name, description, is_private, announcements_only, created_at')
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: 'update_failed', details: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true, channel: data })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'unexpected_error', details: String(err?.message ?? err) },
      { status: 500 }
    )
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return auth.res

    const { id } = await ctx.params
    const channelId = String(id ?? '').trim()
    if (!channelId) return NextResponse.json({ error: 'missing_id' }, { status: 400 })

    const ok = new URL(req.url).searchParams.get('confirm') === 'true'
    if (!ok) {
      return NextResponse.json({ error: 'confirm_required' }, { status: 400 })
    }

    const { error } = await auth.supabase.from('intranet_channels').delete().eq('id', channelId)
    if (error) {
      return NextResponse.json({ error: 'delete_failed', details: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'unexpected_error', details: String(err?.message ?? err) },
      { status: 500 }
    )
  }
}
