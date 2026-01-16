import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

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

type CreateBody = {
  email: string
  name?: string | null
  role?: 'admin' | 'employee'
  hourly_rate?: number | null
  home_address?: string | null
}

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return auth.res

    const body = (await req.json()) as CreateBody
    const email = String(body?.email ?? '').trim().toLowerCase()
    const name = body?.name === undefined ? null : String(body?.name ?? '').trim() || null
    const role = body?.role === 'admin' ? 'admin' : 'employee'
    const hourly_rate = body?.hourly_rate === null || body?.hourly_rate === undefined ? null : Number(body.hourly_rate)
    const home_address = body?.home_address === undefined ? null : String(body?.home_address ?? '').trim() || null

    if (!email) {
      return NextResponse.json({ error: 'missing_email' }, { status: 400 })
    }

    const origin = new URL(req.url).origin

    // Invite user by email and send them to password setup
    const { data: invited, error: inviteError } = await auth.supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${origin}/reset-password`,
    })

    if (inviteError || !invited?.user?.id) {
      return NextResponse.json(
        { error: 'invite_failed', details: inviteError?.message ?? null },
        { status: 400 }
      )
    }

    const newUserId = invited.user.id

    // Ensure profile row exists / is updated
    const { error: upsertError } = await auth.supabase
      .from('profiles')
      .upsert(
        {
          id: newUserId,
          email,
          name,
          role,
          hourly_rate,
          home_address,
        },
        { onConflict: 'id' }
      )

    if (upsertError) {
      return NextResponse.json(
        { error: 'profile_upsert_failed', details: upsertError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true, id: newUserId })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'unexpected_error', details: String(err?.message ?? err) },
      { status: 500 }
    )
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return auth.res

    const url = new URL(req.url)
    const id = String(url.searchParams.get('id') ?? '').trim()

    if (!id) {
      return NextResponse.json({ error: 'missing_id' }, { status: 400 })
    }

    // Soft-delete: keep historical data (e.g. time_entries) intact.
    // 1) Mark profile as deleted (so we can hide the user in UI)
    const { error: profileError } = await auth.supabase
      .from('profiles')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)

    if (profileError) {
      return NextResponse.json(
        { error: 'profile_soft_delete_failed', details: profileError.message },
        { status: 500 }
      )
    }

    // 2) Prevent logins going forward
    const { error: banError } = await auth.supabase.auth.admin.updateUserById(id, {
      // ~100 years
      ban_duration: '876000h',
    })

    if (banError) {
      return NextResponse.json(
        { error: 'ban_failed', details: banError.message },
        { status: 400 }
      )
    }

    return NextResponse.json({ ok: true, soft_deleted: true })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'unexpected_error', details: String(err?.message ?? err) },
      { status: 500 }
    )
  }
}
