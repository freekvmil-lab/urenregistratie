import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')

  // 1️⃣ userId is verplicht
  if (!userId) {
    return NextResponse.json(
      { error: 'userId_missing' },
      { status: 400 }
    )
  }

  // 2️⃣ Supabase admin client (GEEN auth nodig)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 3️⃣ Google account ophalen
  const { data: googleAccount, error } = await supabase
    .from('google_accounts')
    .select('access_token, expires_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !googleAccount?.access_token) {
    return NextResponse.json(
      { error: 'google_not_connected' },
      { status: 400 }
    )
  }

  // 4️⃣ Tijdsperiode: gisteren → morgen
  const start = new Date()
  start.setDate(start.getDate() - 1)
  start.setHours(0, 0, 0, 0)

  const end = new Date()
  end.setDate(end.getDate() + 1)
  end.setHours(23, 59, 59, 999)

  // 5️⃣ Google Calendar API call
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
        Authorization: `Bearer ${googleAccount.access_token}`,
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

  // 6️⃣ Normaliseren
  const events =
    json.items?.map((e: any) => ({
      title: e.summary ?? '',
      start: e.start.dateTime ?? e.start.date,
      end: e.end.dateTime ?? e.end.date,
      location: e.location ?? null,
      source: 'google',
    })) ?? []

  // 7️⃣ Klaar
  return NextResponse.json({ events })
}
