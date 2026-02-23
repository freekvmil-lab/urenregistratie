import { NextResponse } from 'next/server'
import webpush, { type PushSubscription } from 'web-push'
import { createClient } from '@supabase/supabase-js'
import { p256 } from '@noble/curves/nist.js'

export const runtime = 'nodejs'

const decodeJwtPayload = (jwt: string): Record<string, any> | null => {
  const parts = jwt.split('.')
  if (parts.length < 2) return null
  const base64Url = parts[1]
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  try {
    const json = Buffer.from(padded, 'base64').toString('utf8')
    return JSON.parse(json)
  } catch {
    return null
  }
}

const base64UrlToBytes = (s: string) => {
  const base64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  return new Uint8Array(Buffer.from(padded, 'base64'))
}

const bytesToBase64Url = (bytes: Uint8Array) =>
  Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')

type Body = {
  subscription: PushSubscription
  title?: string
  body?: string
  url?: string
}

export async function POST(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: 'Supabase env ontbreekt' }, { status: 500 })
  }

  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey || supabaseAnonKey)
  const { data: userRes, error: userErr } = await supabase.auth.getUser(token)
  if (userErr || !userRes.user) {
    const payload = decodeJwtPayload(token)
    const tokenIss = typeof payload?.iss === 'string' ? payload.iss : null
    const expectedIss = `${supabaseUrl.replace(/\/+$/, '')}/auth/v1`

    const hints: string[] = []
    if (tokenIss && tokenIss !== expectedIss) {
      hints.push(
        `Je login-token is uitgegeven door ${tokenIss}, maar de server staat ingesteld op ${expectedIss}. Check je Vercel env vars en redeploy.`
      )
    } else {
      hints.push('Check of je Vercel env vars (NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY) exact dezelfde Supabase project gebruiken als je app.')
      hints.push('Als je net env vars aangepast hebt op Vercel: redeploy zodat client en server dezelfde waarden gebruiken.')
    }

    const errorText = tokenIss
      ? `Niet ingelogd (badjwttoken) — tokenIss=${tokenIss} — expectedIss=${expectedIss}`
      : `Niet ingelogd (badjwttoken) — expectedIss=${expectedIss}`

    return NextResponse.json(
      {
        error: errorText,
        details: {
          supabaseUrl,
          expectedIss,
          tokenIss,
          message: userErr?.message,
          hints,
        },
      },
      { status: 403 }
    )
  }

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || process.env.NEXT_PUBLIC_VAPID_PRIVATE_KEY
  const requestOrigin = (() => {
    try {
      return new URL(req.url).origin
    } catch {
      return null
    }
  })()
  const subject = process.env.VAPID_SUBJECT || requestOrigin || 'mailto:admin@example.com'

  if (!vapidPublicKey || !vapidPrivateKey) {
    return NextResponse.json(
      { error: 'VAPID keys ontbreken. Zet NEXT_PUBLIC_VAPID_PUBLIC_KEY en VAPID_PRIVATE_KEY in .env.local' },
      { status: 500 }
    )
  }

  // Verify keypair match to avoid confusing push-provider errors like "BadJwtToken".
  try {
    const privBytes = base64UrlToBytes(vapidPrivateKey)
    if (privBytes.length !== 32) {
      return NextResponse.json(
        {
          error: `VAPID private key heeft ${privBytes.length} bytes (verwacht 32). Check VAPID_PRIVATE_KEY.`,
        },
        { status: 500 }
      )
    }
    const derivedPublic = bytesToBase64Url(p256.getPublicKey(privBytes, false))
    if (derivedPublic !== vapidPublicKey) {
      return NextResponse.json(
        {
          error: 'VAPID public/private key mismatch. Regenerate keys of zet beide env vars uit hetzelfde keypair, redeploy, en resubscribe op je telefoon.',
          details: {
            configuredPublicPrefix: vapidPublicKey.slice(0, 12),
            derivedPublicPrefix: derivedPublic.slice(0, 12),
          },
        },
        { status: 500 }
      )
    }
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'VAPID keypair check mislukt' },
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

  const endpointOrigin = (() => {
    try {
      return new URL(body.subscription.endpoint).origin
    } catch {
      return null
    }
  })()

  try {
    await webpush.sendNotification(body.subscription, payload)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    // web-push throws with statusCode/body in many cases
    return NextResponse.json(
      {
        error: 'Push versturen mislukt',
        details: {
          endpointOrigin,
          vapidSubject: subject,
          vapidPublicPrefix: vapidPublicKey.slice(0, 12),
          message: err?.message,
          statusCode: err?.statusCode,
          body: err?.body,
        },
      },
      { status: 500 }
    )
  }
}
