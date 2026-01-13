import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')

  if (!userId) {
    return NextResponse.json({ error: 'userId_missing' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 1️⃣ Google account ophalen
  const { data: googleAccount } = await supabase
    .from('google_accounts')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (!googleAccount?.refresh_token) {
    return NextResponse.json(
      { error: 'google_not_connected' },
      { status: 400 }
    )
  }

  let accessToken = googleAccount.access_token
  const isExpired =
    !googleAccount.expires_at ||
    new Date(googleAccount.expires_at).getTime() < Date.now()

  // 2️⃣ 🔁 Token refresh indien verlopen
  if (isExpired) {
    const refreshRes = await fetch(
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          refresh_token: googleAccount.refresh_token,
          grant_type: 'refresh_token',
        }),
      }
    )

    const refreshed = await refreshRes.json()

    if (!refreshed.access_token) {
      return NextResponse.json(
        { error: 'google_refresh_failed', details: refreshed },
        { status: 401 }
      )
    }

    accessToken = refreshed.access_token

    // 3️⃣ Nieuw token opslaan
    await supabase.from('google_accounts').update({
      access_token: refreshed.access_token,
      expires_at: new Date(
        Date.now() + refreshed.expires_in * 1000
      ).toISOString(),
    }).eq('user_id', userId)
  }

  // 4️⃣ Agenda ophalen (gisteren → morgen)
  const start = new Date()
  start.setDate(start.getDate() - 1)
  start.setHours(0, 0, 0, 0)

  const end = new Date()
  end.setDate(end.getDate() + 1)
  end.setHours(23, 59, 59, 999)

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
      new URLSearchParams({
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
      }),
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json(
      { error: 'google_api_error', details: err },
      { status: 500 }
    )
  }

  const json = await res.json()

  const events =
    json.items?.map((e: any) => ({
      title: e.summary ?? '',
      start: e.start.dateTime ?? e.start.date,
      end: e.end.dateTime ?? e.end.date,
      location: e.location ?? null,
      source: 'google',
    })) ?? []

  return NextResponse.json({ events })
}
