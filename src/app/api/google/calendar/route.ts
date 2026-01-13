import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: Request) {
  try {
    /* =========================
       1️⃣ Supabase server client
    ========================= */
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    /* =========================
       2️⃣ Auth token (header OR cookie) → user
       Support Authorization: Bearer <token> from client
    ========================= */
    const authHeader = req.headers.get('authorization')
    let supabaseAccessToken: string | undefined

    if (authHeader && authHeader.startsWith('Bearer ')) {
      supabaseAccessToken = authHeader.split(' ')[1]
    } else {
      const cookieStore = await cookies()
      const authCookie = cookieStore
        .getAll()
        .find(
          (c) =>
            c.name.startsWith('sb-') &&
            c.name.endsWith('-auth-token')
        )

      if (authCookie) {
        const session = JSON.parse(
          decodeURIComponent(authCookie.value)
        )
        supabaseAccessToken = session?.access_token
      }
    }

    if (!supabaseAccessToken) {
      return NextResponse.json(
        { error: 'not_authenticated' },
        { status: 401 }
      )
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(supabaseAccessToken)

    if (userError || !user) {
      return NextResponse.json(
        { error: 'not_authenticated' },
        { status: 401 }
      )
    }

    /* =========================
       3️⃣ Google token ophalen (en refresh handling)
    ========================= */
    const { data: googleAccount } = await supabase
      .from('google_accounts')
      .select('access_token, refresh_token, expires_at')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!googleAccount?.access_token) {
      return NextResponse.json(
        { error: 'google_not_connected' },
        { status: 400 }
      )
    }

    // Helper to refresh access token using stored refresh_token
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

      if (!tokenRes.ok) return null
      const tokenJson = await tokenRes.json()
      if (!tokenJson.access_token) return null

      const newExpiresAt = new Date(Date.now() + tokenJson.expires_in * 1000).toISOString()

      await supabase
        .from('google_accounts')
        .update({
          access_token: tokenJson.access_token,
          refresh_token: tokenJson.refresh_token ?? refreshToken,
          expires_at: newExpiresAt,
        })
        .eq('user_id', user.id)

      return tokenJson.access_token
    }

    // If expires_at exists and is in the past, try to refresh now
    let googleAccessToken = googleAccount.access_token
    if (googleAccount.expires_at) {
      const expiresAt = new Date(googleAccount.expires_at)
      if (expiresAt.getTime() <= Date.now() && googleAccount.refresh_token) {
        const refreshed = await refreshAccessToken(googleAccount.refresh_token)
        if (refreshed) googleAccessToken = refreshed
      }
    }

    /* =========================
       4️⃣ Agenda ophalen
       (gisteren, vandaag, morgen)
    ========================= */
    const start = new Date()
    start.setDate(start.getDate() - 1)
    start.setHours(0, 0, 0, 0)

    const end = new Date()
    end.setDate(end.getDate() + 1)
    end.setHours(23, 59, 59, 999)

    // Fetch events with pagination (in case there are many) and handle auth refresh
    const fetchEventsFromGoogle = async (accessToken: string) => {
      let pageToken: string | undefined = undefined
      const items: any[] = []

      do {
        const params: Record<string, string> = {
          timeMin: start.toISOString(),
          timeMax: end.toISOString(),
          singleEvents: 'true',
          orderBy: 'startTime',
          maxResults: '2500',
        }
        if (pageToken) params.pageToken = pageToken

        const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?' + new URLSearchParams(params), {
          headers: { Authorization: `Bearer ${accessToken}` },
        })

        const text = await res.text()
        let parsed: any
        try {
          parsed = JSON.parse(text)
        } catch (err) {
          parsed = { error: 'invalid_json', raw: text }
        }

        if (!res.ok) return { ok: false, status: res.status, body: parsed }

        items.push(...(parsed.items ?? []))
        pageToken = parsed.nextPageToken
      } while (pageToken)

      return { ok: true, items }
    }

    let googleFetch = await fetchEventsFromGoogle(googleAccessToken)
    if (!googleFetch.ok && googleFetch.status === 401 && googleAccount.refresh_token) {
      const refreshed = await refreshAccessToken(googleAccount.refresh_token)
      if (refreshed) {
        googleFetch = await fetchEventsFromGoogle(refreshed)
      }
    }

    if (!googleFetch.ok) {
      return NextResponse.json({ error: 'google_api_error', details: googleFetch.body }, { status: 500 })
    }

    const events = (googleFetch.items ?? [])
      .filter((e: any) => e.status !== 'cancelled')
      .map((e: any) => {
        const isAllDay = !!e.start?.date
        const startVal = e.start?.dateTime ?? e.start?.date
        const endVal = e.end?.dateTime ?? e.end?.date
        return {
          title: e.summary ?? '',
          start: startVal,
          end: endVal,
          location: e.location ?? null,
          source: 'google',
          isAllDay,
          attendees: e.attendees ?? null,
        }
      })
      .filter((ev: any) => ev.start && ev.end)

    /* =========================
       5️⃣ Klaar
    ========================= */
    return NextResponse.json({ events })
  } catch (e: any) {
    console.error('Calendar API crash', e)
    return NextResponse.json(
      { error: 'server_error' },
      { status: 500 }
    )
  }
}
