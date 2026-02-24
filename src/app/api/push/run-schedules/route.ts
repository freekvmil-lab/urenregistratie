import { NextResponse } from 'next/server'
import webpush, { type PushSubscription } from 'web-push'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const getAdminClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY)')
  }
  return createClient(url, serviceKey)
}

const requireCronSecret = (req: Request) => {
  const secret = process.env.CRON_SECRET
  if (!secret) return { ok: true as const } // allow running without secret (optional)

  const url = new URL(req.url)
  const provided = url.searchParams.get('secret') || req.headers.get('x-cron-secret')
  if (!provided || provided !== secret) {
    return { ok: false as const, res: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  }
  return { ok: true as const }
}

const chunk = <T,>(arr: T[], size: number) => {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

const addMinutes = (d: Date, minutes: number) => new Date(d.getTime() + minutes * 60_000)
const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000)
const addMonths = (d: Date, months: number) => {
  const next = new Date(d.getTime())
  next.setUTCMonth(next.getUTCMonth() + months)
  return next
}

const bumpUntilFuture = (base: Date, now: Date, bump: (d: Date) => Date) => {
  let next = bump(base)
  let guard = 0
  while (next.getTime() <= now.getTime() && guard < 500) {
    next = bump(next)
    guard += 1
  }
  return next
}

export async function GET(req: Request) {
  try {
    const gate = requireCronSecret(req)
    if (!gate.ok) return gate.res

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || process.env.NEXT_PUBLIC_VAPID_PRIVATE_KEY
    const subject = process.env.VAPID_SUBJECT || new URL(req.url).origin

    if (!vapidPublicKey || !vapidPrivateKey) {
      return NextResponse.json(
        { error: 'vapid_missing', details: 'Zet NEXT_PUBLIC_VAPID_PUBLIC_KEY en VAPID_PRIVATE_KEY in environment.' },
        { status: 500 }
      )
    }

    webpush.setVapidDetails(subject, vapidPublicKey, vapidPrivateKey)

    const supabase = getAdminClient()

    const now = new Date()

    const { data: schedules, error: schedErr } = await supabase
      .from('push_schedules')
      .select('id, enabled, title, body, url, target_all, target_user_ids, target_group_ids, repeat_minutes, repeat_weeks, repeat_months, next_run_at')
      .eq('enabled', true)
      .lte('next_run_at', now.toISOString())
      .order('next_run_at', { ascending: true })
      .limit(25)

    if (schedErr) {
      return NextResponse.json({ error: 'schedules_query_failed', details: schedErr.message }, { status: 400 })
    }

    const due = schedules ?? []
    if (due.length === 0) {
      return NextResponse.json({ ok: true, ran: 0 })
    }

    let ran = 0
    let sent = 0
    let failed = 0
    let removed = 0

    for (const s of due as any[]) {
      const scheduleId = String(s.id)
      const title = String(s.title ?? '').trim()
      const message = String(s.body ?? '').trim()
      const url = String(s.url ?? '/').trim() || '/'
      const targetAll = Boolean(s.target_all)
      const targetUserIds = Array.isArray(s.target_user_ids) ? (s.target_user_ids as any[]).map(String).filter(Boolean) : []
      const targetGroupIds = Array.isArray(s.target_group_ids) ? (s.target_group_ids as any[]).map(String).filter(Boolean) : []
      const repeatMinutes = s.repeat_minutes === null || s.repeat_minutes === undefined ? null : Number(s.repeat_minutes)
      const repeatWeeks = s.repeat_weeks === null || s.repeat_weeks === undefined ? null : Number(s.repeat_weeks)
      const repeatMonths = s.repeat_months === null || s.repeat_months === undefined ? null : Number(s.repeat_months)

      const baseDueAt = new Date(String(s.next_run_at))
      const dueAt = Number.isNaN(baseDueAt.getTime()) ? now : baseDueAt

      if (!title || !message) {
        await supabase.from('push_schedules').update({ enabled: false, last_run_at: now.toISOString() }).eq('id', scheduleId)
        continue
      }

      let subsQuery = supabase
        .from('push_subscriptions')
        .select('user_id, endpoint, subscription')

      if (!targetAll) {
        let resolvedUserIds = targetUserIds

        if (targetGroupIds.length > 0) {
          const { data: groups, error: gErr } = await supabase
            .from('push_target_groups')
            .select('id, user_ids')
            .in('id', targetGroupIds)

          if (gErr) {
            return NextResponse.json({ error: 'groups_query_failed', details: gErr.message }, { status: 400 })
          }

          const fromGroups = (groups ?? [])
            .flatMap((g: any) => (Array.isArray(g.user_ids) ? g.user_ids : []))
            .map(String)
            .filter(Boolean)

          resolvedUserIds = Array.from(new Set([...resolvedUserIds, ...fromGroups]))
        }

        if (resolvedUserIds.length === 0) {
          await supabase.from('push_schedules').update({ enabled: false, last_run_at: now.toISOString() }).eq('id', scheduleId)
          continue
        }
        subsQuery = subsQuery.in('user_id', resolvedUserIds)
      }

      const { data: subs, error: subErr } = await subsQuery
      if (subErr) {
        return NextResponse.json({ error: 'subscriptions_query_failed', details: subErr.message }, { status: 400 })
      }

      const subscriptions = (subs ?? [])
        .map((r: any) => ({
          user_id: String(r.user_id),
          endpoint: String(r.endpoint),
          subscription: r.subscription as PushSubscription,
        }))
        .filter((r) => r.endpoint && r.subscription)

      const payload = JSON.stringify({ title, body: message, url })

      for (const group of chunk(subscriptions, 10)) {
        await Promise.allSettled(
          group.map(async (sub) => {
            try {
              await webpush.sendNotification(sub.subscription, payload)
              sent += 1
            } catch (err: any) {
              failed += 1
              if (err?.statusCode === 410 || err?.statusCode === 404) {
                const { error: delErr } = await supabase
                  .from('push_subscriptions')
                  .delete()
                  .eq('endpoint', sub.endpoint)
                  .eq('user_id', sub.user_id)
                if (!delErr) removed += 1
              }
            }
          })
        )
      }

      const next: any = { last_run_at: now.toISOString() }

      const hasMinutes = repeatMinutes !== null && Number.isFinite(repeatMinutes) && repeatMinutes > 0
      const hasWeeks = repeatWeeks !== null && Number.isFinite(repeatWeeks) && repeatWeeks > 0
      const hasMonths = repeatMonths !== null && Number.isFinite(repeatMonths) && repeatMonths > 0

      if (hasMinutes) {
        const n = repeatMinutes as number
        next.next_run_at = bumpUntilFuture(dueAt, now, (d) => addMinutes(d, n)).toISOString()
        next.enabled = true
      } else if (hasWeeks) {
        const n = repeatWeeks as number
        next.next_run_at = bumpUntilFuture(dueAt, now, (d) => addDays(d, n * 7)).toISOString()
        next.enabled = true
      } else if (hasMonths) {
        const n = repeatMonths as number
        next.next_run_at = bumpUntilFuture(dueAt, now, (d) => addMonths(d, n)).toISOString()
        next.enabled = true
      } else {
        next.enabled = false
      }

      await supabase.from('push_schedules').update(next).eq('id', scheduleId)
      ran += 1
    }

    return NextResponse.json({ ok: true, ran, sent, failed, removed })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'unexpected_error', details: String(err?.message ?? err) },
      { status: 500 }
    )
  }
}
