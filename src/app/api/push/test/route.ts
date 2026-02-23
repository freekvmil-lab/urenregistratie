import { NextResponse } from 'next/server'
import webpush, { type PushSubscription } from 'web-push'
import { createClient } from '@supabase/supabase-js'

type Body = {
  subscription: PushSubscription
  title?: string
  body?: string
  url?: string
}

export async function POST(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: 'Supabase env ontbreekt' }, { status: 500 })
  }

  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey)
  const { data: userRes, error: userErr } = await supabase.auth.getUser(token)
  if (userErr || !userRes.user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || process.env.NEXT_PUBLIC_VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@vortexx.local'

  if (!vapidPublicKey || !vapidPrivateKey) {
    return NextResponse.json(
      { error: 'VAPID keys ontbreken. Zet NEXT_PUBLIC_VAPID_PUBLIC_KEY en VAPID_PRIVATE_KEY in .env.local' },
      { status: 500 }
    )
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  if (!body?.subscription?.endpoint) {
    return NextResponse.json({ error: 'subscription ontbreekt' }, { status: 400 })
  }

  webpush.setVapidDetails(subject, vapidPublicKey, vapidPrivateKey)

  const payload = JSON.stringify({
    title: body.title || 'Vortexx',
    body: body.body || 'Test notificatie',
    url: body.url || '/'
  })

  try {
    await webpush.sendNotification(body.subscription, payload)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    // web-push throws with statusCode/body in many cases
    return NextResponse.json(
      {
        error: 'Push versturen mislukt',
        details: {
          message: err?.message,
          statusCode: err?.statusCode,
          body: err?.body,
        },
      },
      { status: 500 }
    )
  }
}
