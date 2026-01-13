import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  try {
    const cookieStore = await cookies()

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY! // server only
    )

    // 1️⃣ Supabase auth cookie → user
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
    } = await supabaseAdmin.auth.getUser(accessToken)

    if (!user) {
      return NextResponse.json(
        { error: 'user_not_found' },
        { status: 401 }
      )
    }

    // 2️⃣ Google account ophalen
    const { data: googleAccount } = await supabaseAdmin
      .from('google_accounts')
      .select('access_token')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!googleAccount?.access_token) {
      return NextResponse.json(
        { error: 'google_not_connected' },
        { status: 400 }
      )
    }

    // 3️⃣ Google Calendar API call
    const now = new Date()
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
        new URLSearchParams({
          timeMin: now.toISOString(),
          timeMax: tomorrow.toISOString(),
          singleEvents: 'true',
          orderBy: 'startTime',
        }),
      {
        headers: {
          Authorization: `Bearer ${googleAccount.access_token}`,
        },
      }
    )

    const json = await res.json()

    if (!json.items) {
      return NextResponse.json({ events: [] })
    }

    // 4️⃣ Normaliseren (alleen bruikbare events)
    const events = json.items
      .filter(
        (e: any) =>
          e.start?.dateTime && e.end?.dateTime
      )
      .map((e: any) => ({
        title: e.summary ?? '',
        start: e.start.dateTime,
        end: e.end.dateTime,
        location: e.location ?? null,
        source: 'google',
      }))

    return NextResponse.json({ events })
  } catch (err) {
    console.error('calendar error', err)
    return NextResponse.json(
      { error: 'server_error' },
      { status: 500 }
    )
  }
}
