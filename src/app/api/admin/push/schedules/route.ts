import { NextResponse } from 'next/server'
import { requireAdmin } from '../_utils'

export const runtime = 'nodejs'

type CreateBody = {
  name?: string | null
  enabled?: boolean
  title: string
  body: string
  url?: string
  target: 'all' | 'users'
  userIds?: string[]
  groupIds?: string[]
  repeatMinutes?: number | null
  nextRunAt?: string | null
}

export async function GET(req: Request) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return auth.res

    const { data, error } = await auth.supabase
      .from('push_schedules')
      .select('id, name, enabled, title, body, url, target_all, target_user_ids, target_group_ids, repeat_minutes, next_run_at, last_run_at, created_at, updated_at')
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: 'schedules_query_failed', details: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true, schedules: data ?? [] })
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

    let body: CreateBody
    try {
      body = (await req.json()) as CreateBody
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
    }

    const title = String(body?.title ?? '').trim()
    const message = String(body?.body ?? '').trim()
    const url = String(body?.url ?? '/').trim() || '/'
    const target = body?.target === 'users' ? 'users' : 'all'
    const userIds = Array.isArray(body?.userIds) ? body.userIds.map(String).filter(Boolean) : []
    const groupIds = Array.isArray(body?.groupIds) ? body.groupIds.map(String).filter(Boolean) : []

    if (!title || !message) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
    }

    const repeatMinutes = body?.repeatMinutes === null || body?.repeatMinutes === undefined ? null : Number(body.repeatMinutes)
    if (repeatMinutes !== null && (!Number.isFinite(repeatMinutes) || repeatMinutes < 1)) {
      return NextResponse.json({ error: 'invalid_repeatMinutes' }, { status: 400 })
    }

    let nextRunAt = body?.nextRunAt ? String(body.nextRunAt) : null
    if (nextRunAt) {
      const d = new Date(nextRunAt)
      if (Number.isNaN(d.getTime())) return NextResponse.json({ error: 'invalid_nextRunAt' }, { status: 400 })
      nextRunAt = d.toISOString()
    }

    const insert = {
      name: body?.name === undefined ? null : (body?.name === null ? null : String(body.name).trim() || null),
      enabled: body?.enabled === false ? false : true,
      title,
      body: message,
      url,
      target_all: target === 'all',
      target_user_ids: target === 'users' ? userIds : null,
      target_group_ids: target === 'users' ? groupIds : null,
      repeat_minutes: repeatMinutes,
      next_run_at: nextRunAt ?? new Date().toISOString(),
      created_by: auth.callerId,
    }

    const { data, error } = await auth.supabase
      .from('push_schedules')
      .insert(insert)
      .select('id')
      .single()

    if (error) {
      return NextResponse.json({ error: 'schedule_create_failed', details: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true, id: data?.id })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'unexpected_error', details: String(err?.message ?? err) },
      { status: 500 }
    )
  }
}
