import { NextResponse } from 'next/server'
import { requireAdmin } from '../../_utils'

export const runtime = 'nodejs'

type PatchBody = {
  name?: string | null
  enabled?: boolean
  title?: string
  body?: string
  url?: string
  target?: 'all' | 'users'
  userIds?: string[]
  groupIds?: string[]
  repeatMinutes?: number | null
  repeatUnit?: 'once' | 'minutes' | 'weeks' | 'months'
  repeatEvery?: number | null
  nextRunAt?: string | null
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return auth.res

    const { id } = await ctx.params
    const scheduleId = String(id ?? '').trim()
    if (!scheduleId) return NextResponse.json({ error: 'missing_id' }, { status: 400 })

    let body: PatchBody
    try {
      body = (await req.json()) as PatchBody
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
    }

    const patch: any = {}

    if ('name' in body) {
      patch.name = body.name === null ? null : String(body.name ?? '').trim() || null
    }

    if ('enabled' in body) {
      patch.enabled = body.enabled === false ? false : true
    }

    if (typeof body.title === 'string') patch.title = body.title.trim()
    if (typeof body.body === 'string') patch.body = body.body.trim()
    if (typeof body.url === 'string') patch.url = body.url.trim() || '/'

    if (body.repeatUnit) {
      if (body.repeatUnit === 'once') {
        patch.repeat_minutes = null
        patch.repeat_weeks = null
        patch.repeat_months = null
      } else {
        const n = body.repeatEvery === null || body.repeatEvery === undefined ? NaN : Number(body.repeatEvery)
        if (!Number.isFinite(n) || n < 1) return NextResponse.json({ error: 'invalid_repeatEvery' }, { status: 400 })

        patch.repeat_minutes = null
        patch.repeat_weeks = null
        patch.repeat_months = null

        if (body.repeatUnit === 'minutes') patch.repeat_minutes = n
        else if (body.repeatUnit === 'weeks') patch.repeat_weeks = n
        else if (body.repeatUnit === 'months') patch.repeat_months = n
        else return NextResponse.json({ error: 'invalid_repeatUnit' }, { status: 400 })
      }
    } else {
      // Backward compatibility
      if (body.repeatMinutes === null) {
        patch.repeat_minutes = null
      } else if (body.repeatMinutes !== undefined) {
        const n = Number(body.repeatMinutes)
        if (!Number.isFinite(n) || n < 1) return NextResponse.json({ error: 'invalid_repeatMinutes' }, { status: 400 })
        patch.repeat_minutes = n
        patch.repeat_weeks = null
        patch.repeat_months = null
      }
    }

    if (body.nextRunAt === null) patch.next_run_at = new Date().toISOString()
    else if (body.nextRunAt !== undefined) {
      const d = new Date(String(body.nextRunAt))
      if (Number.isNaN(d.getTime())) return NextResponse.json({ error: 'invalid_nextRunAt' }, { status: 400 })
      patch.next_run_at = d.toISOString()
    }

    if (body.target) {
      const target = body.target === 'users' ? 'users' : 'all'
      const userIds = Array.isArray(body.userIds) ? body.userIds.map(String).filter(Boolean) : []
      const groupIds = Array.isArray(body.groupIds) ? body.groupIds.map(String).filter(Boolean) : []
      patch.target_all = target === 'all'
      patch.target_user_ids = target === 'users' ? userIds : null
      patch.target_group_ids = target === 'users' ? groupIds : null
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'nothing_to_update' }, { status: 400 })
    }

    const { error } = await auth.supabase
      .from('push_schedules')
      .update(patch)
      .eq('id', scheduleId)

    if (error) {
      return NextResponse.json({ error: 'schedule_update_failed', details: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
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
    const scheduleId = String(id ?? '').trim()
    if (!scheduleId) return NextResponse.json({ error: 'missing_id' }, { status: 400 })

    const { error } = await auth.supabase
      .from('push_schedules')
      .delete()
      .eq('id', scheduleId)

    if (error) {
      return NextResponse.json({ error: 'schedule_delete_failed', details: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'unexpected_error', details: String(err?.message ?? err) },
      { status: 500 }
    )
  }
}
