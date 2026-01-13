import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: Request) {
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
  const { data: googleAccount } = await supabase
    .from('google_accounts')
    .select('access_token')
    .eq('user_id', userId)
    .maybeSingle()

  if (!googleAccount?.access_token) {
    return NextResponse.json(
      { error: 'google_not_connected' },
      { status: 400 }
    )
  }

  // 2️⃣ Agenda ophalen (vandaag + morgen)
  const start = new Date()
start.setHours(0, 0, 0, 0)

const end = new Date()
end.setDate(end.getDate() + 7)
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
        Authorization: `Bearer ${googleAccount.access_token}`,
      },
    }
  )
  const raw = await res.text()

console.log('Google raw response:', raw)

const data = JSON.parse(raw)


  const json = await res.json()

  const events =
    json.items
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

  return NextResponse.json({ events })
  return Response.json({
  debug: true,
  raw: data,
})

}
