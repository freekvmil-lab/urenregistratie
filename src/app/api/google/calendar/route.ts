import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  const cookieStore = await cookies()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const authCookie = cookieStore
    .getAll()
    .find(
      (c) =>
        c.name.startsWith('sb-') &&
        c.name.endsWith('-auth-token')
    )

  if (!authCookie) {
    return NextResponse.json(
      { error: 'not_authenticated' },
      { status: 401 }
    )
  }

  const session = JSON.parse(
    decodeURIComponent(authCookie.value)
  )

  const accessToken = session?.access_token

  if (!accessToken) {
    return NextResponse.json(
      { error: 'no_access_token' },
      { status: 401 }
    )
  }

  const {
    data: { user },
  } = await supabase.auth.getUser(accessToken)

  if (!user) {
    return NextResponse.json(
      { error: 'user_not_found' },
      { status: 401 }
    )
  }

  // 🔑 Google account ophalen
  const { data: google } = await supabase
    .from('google_accounts')
    .select('access_token')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!google?.access_token) {
    return NextResponse.json(
      { error: 'google_not_connected' },
      { status: 400 }
    )
  }

  // 📅 gisteren → morgen
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
        Authorization: `Bearer ${google.access_token}`,
      },
    }
  )

  const json = await res.json()

  const events =
    json.items
      ?.filter(
        (e: any) =>
          e.start?.dateTime &&
          e.end?.dateTime
      )
      .map((e: any) => ({
        title: e.summary ?? '',
        start: e.start.dateTime,
        end: e.end.dateTime,
        location: e.location ?? null,
      })) ?? []

  return NextResponse.json({ events })
}
