import { NextResponse } from 'next/server'
import { requireAdmin } from '../_utils'

export const runtime = 'nodejs'

type CreateBody = {
  name: string
  userIds: string[]
}

export async function GET(req: Request) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return auth.res

    const { data, error } = await auth.supabase
      .from('push_target_groups')
      .select('id, name, user_ids, created_at, updated_at, created_by')
      .order('name')

    if (error) {
      return NextResponse.json({ error: 'groups_query_failed', details: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true, groups: data ?? [] })
  } catch (err: any) {
    return NextResponse.json({ error: 'unexpected_error', details: String(err?.message ?? err) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return auth.res

    let body: CreateBody
    try {
      body = (await req.json()) as CreateBody
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
    }

    const name = String(body?.name ?? '').trim()
    const userIds = Array.isArray(body?.userIds) ? body.userIds.map(String).filter(Boolean) : []

    if (!name) return NextResponse.json({ error: 'missing_name' }, { status: 400 })

    const { data, error } = await auth.supabase
      .from('push_target_groups')
      .insert({ name, user_ids: userIds, created_by: auth.callerId })
      .select('id')
      .single()

    if (error) {
      return NextResponse.json({ error: 'group_create_failed', details: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true, id: data?.id })
  } catch (err: any) {
    return NextResponse.json({ error: 'unexpected_error', details: String(err?.message ?? err) }, { status: 500 })
  }
}
