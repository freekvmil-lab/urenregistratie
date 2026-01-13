import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json(
        { error: 'userId_missing' },
        { status: 400 }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY! // server only
    )

    // 1️⃣ Google account ophalen
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

    // 2️⃣ Tijdvenster (vandaag t/m +7 dagen)
    const start = new Date()
    start.setHours(0, 0, 0, 0)

    const end = new Date()
    end.setDate(end.getDate() + 7)
    end.setHours(23, 59, 59, 999)

    // 3️⃣ Google Calendar API call
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
        new URLSearchParams({
          timeMin: start.toISOString(),
          timeMax: end.toISOString(),
          singleEvents: 'true',
          orderBy: 'startTime',
          maxResults: '20',
        }),
      {
        headers: {
          Authorization: `Bearer ${googleAccount.access_token}`,
        },
      }
    )

    const data = await res.json()

    // ❗ Als Google zelf een error terugstuurt
    if (!res.ok) {
      console.error('Google API error:', data)
      return NextResponse.json(
        { error: 'google_api_error', details: data },
        { status: 500 }
      )
    }

    // 4️⃣ Events normaliseren (OOK all-day events)
    const events =
      data.items?.map((e: any) => ({
        title: e.summary ?? '',
        start: e.start?.dateTime ?? e.start?.date,
        end: e.end?.dateTime ?? e.end?.date,
        location: e.location ?? null,
        source: 'google',
      })) ?? []

    return NextResponse.json({ events })
  } catch (err) {
    console.error('Calendar route crash:', err)
    return NextResponse.json(
      { error: 'server_error' },
      { status: 500 }
    )
  }
}
