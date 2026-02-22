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

      const tokenText = await tokenRes.text()
      let tokenJson: any
      try {
        tokenJson = JSON.parse(tokenText)
      } catch {
        tokenJson = { raw: tokenText }
      }

      if (!tokenRes.ok || !tokenJson?.access_token) {
        return {
          ok: false as const,
          status: tokenRes.status,
          body: tokenJson,
        }
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

      return { ok: true as const, accessToken: tokenJson.access_token }
    }

    // If expires_at exists and is in the past, try to refresh now
    let googleAccessToken = googleAccount.access_token
    if (googleAccount.expires_at) {
      const expiresAt = new Date(googleAccount.expires_at)
      if (expiresAt.getTime() <= Date.now() && googleAccount.refresh_token) {
        const refreshed = await refreshAccessToken(googleAccount.refresh_token)
        if (refreshed.ok) googleAccessToken = refreshed.accessToken
      }
    }

     /* =========================
       4️⃣ Agenda ophalen
       Default: 1 dag terug, 3 dagen vooruit
       Optioneel via query: ?daysBack=1&daysAhead=14
     ========================= */
     const url = new URL(req.url)
     const daysBackRaw = url.searchParams.get('daysBack')
     const daysAheadRaw = url.searchParams.get('daysAhead')

     const clampInt = (value: string | null, fallback: number, min: number, max: number) => {
      if (value === null || value === undefined || value === '') return fallback
      const n = Number.parseInt(value, 10)
      if (!Number.isFinite(n)) return fallback
      return Math.min(max, Math.max(min, n))
     }

     const daysBack = clampInt(daysBackRaw, 1, 0, 31)
     const daysAhead = clampInt(daysAheadRaw, 3, 0, 90)

     const start = new Date()
     start.setDate(start.getDate() - daysBack)
     start.setHours(0, 0, 0, 0)

     const end = new Date()
     end.setDate(end.getDate() + daysAhead)
     end.setHours(23, 59, 59, 999)

    // Fetch list of calendars for the user, then fetch events from each calendar
    const listCalendars = async (accessToken: string) => {
      const res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) {
        const txt = await res.text()
        let body: any
        try { body = JSON.parse(txt) } catch (err) { body = txt }
        return { ok: false, status: res.status, body }
      }
      const json = await res.json()
      return { ok: true, items: json.items ?? [] }
    }

    const fetchEventsFromCalendar = async (accessToken: string, calendarId: string) => {
      let pageToken: string | undefined = undefined
      const items: any[] = []

      do {
        const params: Record<string, string> = {
          timeMin: start.toISOString(),
          timeMax: end.toISOString(),
          singleEvents: 'true',
          orderBy: 'startTime',
          maxResults: '2500',
          showHiddenInvitations: 'true',
        }
        if (pageToken) params.pageToken = pageToken

        const url = 'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(calendarId) + '/events?' + new URLSearchParams(params)
        const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
        const text = await res.text()
        let parsed: any
        try { parsed = JSON.parse(text) } catch (err) { parsed = { error: 'invalid_json', raw: text } }

        if (!res.ok) return { ok: false, status: res.status, body: parsed }

        items.push(...(parsed.items ?? []))
        pageToken = parsed.nextPageToken
      } while (pageToken)

      return { ok: true, items }
    }

    // get calendars
    let calendarList = await listCalendars(googleAccessToken)
    if (!calendarList.ok && calendarList.status === 401) {
      if (!googleAccount.refresh_token) {
        return NextResponse.json(
          {
            error: 'google_reconnect_required',
            message:
              'Google sessie verlopen en er is geen refresh token opgeslagen. Koppel Google opnieuw via de knop op het dashboard.',
            details: calendarList.body,
          },
          { status: 401 }
        )
      }

      const refreshed = await refreshAccessToken(googleAccount.refresh_token)
      if (!refreshed.ok) {
        return NextResponse.json(
          {
            error: 'google_reconnect_required',
            message:
              'Google sessie ongeldig en refresh is mislukt. Koppel Google opnieuw via de knop op het dashboard.',
            details: {
              calendar: calendarList.body,
              refresh: { status: refreshed.status, body: refreshed.body },
            },
          },
          { status: 401 }
        )
      }

      googleAccessToken = refreshed.accessToken
      calendarList = await listCalendars(googleAccessToken)
    }

    if (!calendarList.ok) {
      return NextResponse.json({ error: 'google_api_error', details: calendarList.body }, { status: 500 })
    }

    const calendars = (calendarList.items ?? []).filter((c: any) => !c.deleted)

    const allItems: any[] = []
    for (const cal of calendars) {
      const calFetch = await fetchEventsFromCalendar(googleAccessToken, cal.id)
      if (!calFetch.ok) continue
      allItems.push(...(calFetch.items ?? []))
    }

    const events = (allItems ?? [])
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
          raw: e,
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
