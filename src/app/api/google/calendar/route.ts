import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  try {
    /* =========================
       1️⃣ Supabase server client
    ========================= */
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    /* =========================
       2️⃣ Auth cookie → user
    ========================= */
    const cookieStore = await cookies()
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
        { error: 'not_authenticated' },
        { status: 401 }
      )
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(accessToken)

    if (userError || !user) {
      return NextResponse.json(
        { error: 'not_authenticated' },
        { status: 401 }
      )
    }

    /* =========================
       3️⃣ Google token ophalen
    ========================= */
    const { data: googleAccount } = await supabase
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

    const res = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?' +
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

    const raw = await res.text()
    const data = JSON.parse(raw)

    if (!res.ok) {
      return NextResponse.json(
        { error: 'google_api_error', details: data },
        { status: 500 }
      )
    }

    const events =
      data.items
        ?.filter(
          (e: any) =>
            e.start?.dateTime && e.end?.dateTime
        )
        .map((e: any) => ({
          title: e.summary ?? '',
          start: e.start.dateTime,
          end: e.end.dateTime,
          location: e.location ?? null,
          source: 'google',
        })) ?? []

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
