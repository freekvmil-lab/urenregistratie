import { NextResponse } from 'next/server'
import webpush, { type PushSubscription } from 'web-push'
import { requireAdmin } from '../_utils'

export const runtime = 'nodejs'

type Body = {
  target: 'all' | 'users'
  userIds?: string[]
  title: string
  body: string
  url?: string
}

const chunk = <T,>(arr: T[], size: number) => {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return auth.res

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || process.env.NEXT_PUBLIC_VAPID_PRIVATE_KEY
    const subject = process.env.VAPID_SUBJECT || new URL(req.url).origin

    if (!vapidPublicKey || !vapidPrivateKey) {
      return NextResponse.json(
        { error: 'vapid_missing', details: 'Zet NEXT_PUBLIC_VAPID_PUBLIC_KEY en VAPID_PRIVATE_KEY in environment.' },
        { status: 500 }
      )
    }

    let body: Body
    try {
      body = (await req.json()) as Body
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
    }

    const title = String(body?.title ?? '').trim()
    const message = String(body?.body ?? '').trim()
    const url = String(body?.url ?? '/').trim() || '/'
    const target = body?.target === 'users' ? 'users' : 'all'
    const userIds = Array.isArray(body?.userIds) ? body.userIds.map(String).filter(Boolean) : []

    if (!title || !message) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
    }

    if (target === 'users' && userIds.length === 0) {
      return NextResponse.json({ error: 'missing_userIds' }, { status: 400 })
    }

    webpush.setVapidDetails(subject, vapidPublicKey, vapidPrivateKey)

    let subsQuery = auth.supabase
      .from('push_subscriptions')
      .select('user_id, endpoint, subscription')

    if (target === 'users') {
      subsQuery = subsQuery.in('user_id', userIds)
    }

    const { data: rows, error } = await subsQuery
    if (error) {
      return NextResponse.json({ error: 'subscriptions_query_failed', details: error.message }, { status: 400 })
    }

    const subscriptions = (rows ?? [])
      .map((r: any) => ({
        user_id: String(r.user_id),
        endpoint: String(r.endpoint),
        subscription: r.subscription as PushSubscription,
      }))
      .filter((r) => r.endpoint && r.subscription)

    const payload = JSON.stringify({ title, body: message, url })

    let sent = 0
    let failed = 0
    let removed = 0

    const failures: Array<{ endpoint: string; statusCode?: number; message?: string }> = []

    // Limit concurrency a bit to avoid timeouts.
    for (const group of chunk(subscriptions, 10)) {
      const results = await Promise.allSettled(
        group.map(async (s) => {
          try {
            await webpush.sendNotification(s.subscription, payload)
            sent += 1
          } catch (err: any) {
            failed += 1
            failures.push({ endpoint: s.endpoint, statusCode: err?.statusCode, message: err?.message })

            // Remove stale subscriptions
            if (err?.statusCode === 410 || err?.statusCode === 404) {
              const { error: delErr } = await auth.supabase
                .from('push_subscriptions')
                .delete()
                .eq('endpoint', s.endpoint)
                .eq('user_id', s.user_id)

              if (!delErr) removed += 1
            }
          }
        })
      )

      // prevent eslint unused
      void results
    }

    return NextResponse.json({
      ok: true,
      totalSubscriptions: subscriptions.length,
      sent,
      failed,
      removed,
      failures: failures.slice(0, 25),
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'unexpected_error', details: String(err?.message ?? err) },
      { status: 500 }
    )
  }
}
