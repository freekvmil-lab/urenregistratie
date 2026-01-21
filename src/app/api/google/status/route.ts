import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: Request) {
  /* =========================
     1️⃣ Supabase admin client
  ========================= */
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  /* =========================
     2️⃣ Auth token (header OR cookie) → user
  ========================= */
  const authHeader = req.headers.get('authorization')
  let accessToken: string | undefined

  if (authHeader && authHeader.startsWith('Bearer ')) {
    accessToken = authHeader.split(' ')[1]
  } else {
    const cookieStore = await cookies()
    const authCookie = cookieStore
      .getAll()
      .find((c) => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'))

    if (authCookie) {
      try {
        const session = JSON.parse(decodeURIComponent(authCookie.value))
        accessToken = session?.access_token
      } catch {
        // ignore parse errors
      }
    }
  }

  if (!accessToken) {
    return NextResponse.json({ connected: false, error: 'not_authenticated' }, { status: 401 })
  }

  /* =========================
     3️⃣ User ophalen
  ========================= */
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(accessToken)

  if (userError || !user) {
    return NextResponse.json(
      { connected: false, error: 'user_not_found' },
      { status: 401 }
    )
  }

  /* =========================
     4️⃣ Google account check + API health
  ========================= */
  const { data } = await supabase
    .from('google_accounts')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!data?.access_token) {
    return NextResponse.json({
      connected: false,
      api_ok: false,
      reconnect_required: false,
      email: null,
      has_refresh_token: false,
      expires_at: null,
    })
  }

  const hasRefreshToken = Boolean((data as any)?.refresh_token)
  const expiresAt = (data as any)?.expires_at ?? null

  const refreshAccessToken = async (refreshToken: string) => {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    })

    const tokenText = await tokenRes.text()
    let tokenJson: any
    try {
      tokenJson = JSON.parse(tokenText)
    } catch {
      tokenJson = { raw: tokenText }
    }

    if (!tokenRes.ok || !tokenJson?.access_token) {
      return { ok: false as const, status: tokenRes.status, body: tokenJson }
    }

    const newExpiresAt = new Date(Date.now() + tokenJson.expires_in * 1000).toISOString()
    await supabase
      .from('google_accounts')
      .update({
        access_token: tokenJson.access_token,
        refresh_token: tokenJson.refresh_token ?? refreshToken,
        expires_at: newExpiresAt,
      })
      .eq('user_id', user.id)

    return { ok: true as const, accessToken: tokenJson.access_token, expires_at: newExpiresAt }
  }

  const listCalendars = async (token: string) => {
    const res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const txt = await res.text()
    let body: any
    try {
      body = JSON.parse(txt)
    } catch {
      body = txt
    }
    return { ok: res.ok, status: res.status, body }
  }

  let googleAccessToken = (data as any).access_token as string

  // Proactive refresh if expired
  if (expiresAt) {
    const exp = new Date(expiresAt)
    if (Number.isFinite(exp.getTime()) && exp.getTime() <= Date.now() && (data as any).refresh_token) {
      const refreshed = await refreshAccessToken((data as any).refresh_token)
      if (refreshed.ok) googleAccessToken = refreshed.accessToken
    }
  }

  let cal = await listCalendars(googleAccessToken)
  if (!cal.ok && cal.status === 401) {
    if (!(data as any).refresh_token) {
      return NextResponse.json({
        connected: true,
        api_ok: false,
        reconnect_required: true,
        email: null,
        has_refresh_token: false,
        expires_at: expiresAt,
        error: 'google_reconnect_required',
      })
    }

    const refreshed = await refreshAccessToken((data as any).refresh_token)
    if (!refreshed.ok) {
      return NextResponse.json({
        connected: true,
        api_ok: false,
        reconnect_required: true,
        email: null,
        has_refresh_token: true,
        expires_at: expiresAt,
        error: 'google_reconnect_required',
      })
    }

    googleAccessToken = refreshed.accessToken
    cal = await listCalendars(googleAccessToken)
  }

  if (!cal.ok) {
    return NextResponse.json({
      connected: true,
      api_ok: false,
      reconnect_required: false,
      email: null,
      has_refresh_token: hasRefreshToken,
      expires_at: expiresAt,
      error: 'google_api_error',
    })
  }

  const items = Array.isArray((cal.body as any)?.items) ? (cal.body as any).items : []
  const primary = items.find((c: any) => c?.primary)
  const email = (primary?.id && typeof primary.id === 'string') ? primary.id : null

  return NextResponse.json({
    connected: true,
    api_ok: true,
    reconnect_required: false,
    email,
    has_refresh_token: hasRefreshToken,
    expires_at: expiresAt,
  })
}
