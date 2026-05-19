import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

interface TokenRow {
  user_id: string
  access_token: string
  refresh_token: string
  expiry_date: number | null
}

interface PlanningMedewerker {
  medewerker_id: string
  medewerker_naam: string | null
}

const getServiceClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://shxlihgfdzfxwjewjnmj.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getValidAccessToken(userId: string, supabase: ReturnType<typeof getServiceClient>) {
  const { data } = await supabase
    .from('google_tokens')
    .select('user_id, access_token, refresh_token, expiry_date')
    .eq('user_id', userId)
    .single()

  const tokenRow = data as TokenRow | null
  if (!tokenRow) return null

  if (tokenRow.expiry_date && Date.now() > tokenRow.expiry_date - 60000) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: tokenRow.refresh_token,
        grant_type: 'refresh_token',
      }),
    })
    const refreshed = await res.json()
    if (refreshed.access_token) {
      await supabase.from('google_tokens').update({
        access_token: refreshed.access_token,
        expiry_date: Date.now() + (refreshed.expires_in ?? 3600) * 1000,
      }).eq('user_id', userId)
      return refreshed.access_token as string
    }
    return null
  }
  return tokenRow.access_token
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { planning_id } = body
    const supabase = getServiceClient()

    // Haal planning + medewerkers + hun emails op
    const { data: planning } = await supabase
      .from('planning')
      .select('*, planning_medewerkers(medewerker_id, medewerker_naam)')
      .eq('id', planning_id)
      .single()

    if (!planning) return NextResponse.json({ error: 'planning_not_found' }, { status: 404 })

    const medewerkers = (planning.planning_medewerkers ?? []) as PlanningMedewerker[]

    // Haal email adressen op van medewerkers
    const medewerkerIds = medewerkers.map((m) => m.medewerker_id)
    const { data: profielen } = await supabase
      .from('profiles')
      .select('id, email')
      .in('id', medewerkerIds)

    const emailMap: Record<string, string> = {}
    for (const p of profielen ?? []) {
      if (p.email) emailMap[p.id] = p.email
    }

    const attendees = medewerkers
      .filter(m => emailMap[m.medewerker_id])
      .map(m => ({ email: emailMap[m.medewerker_id] }))

    const startDateTime = `${planning.datum}T${planning.start_tijd}`
    const endDateTime = `${planning.datum}T${planning.eind_tijd}`
    const medewerkerNamen = medewerkers.map(m => m.medewerker_naam ?? '').join(', ')

    const eventBody = {
      summary: `${planning.titel}${planning.opdrachtgever_naam ? ` - ${planning.opdrachtgever_naam}` : ''}`,
      location: planning.locatie ?? undefined,
      description: `Medewerkers: ${medewerkerNamen}\n${planning.notities ?? ''}`.trim(),
      start: { dateTime: startDateTime, timeZone: 'Europe/Amsterdam' },
      end: { dateTime: endDateTime, timeZone: 'Europe/Amsterdam' },
      attendees,
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 60 },
        ],
      },
    }

    // Haal admin token op (eerste google token = admin)
    const { data: adminTokenRow } = await supabase
      .from('google_tokens')
      .select('user_id')
      .limit(1)
      .single()

    let eventId = null
    if (adminTokenRow) {
      const accessToken = await getValidAccessToken((adminTokenRow as { user_id: string }).user_id, supabase)
      if (accessToken) {
        const res = await fetch(
          'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all',
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(eventBody),
          }
        )
        const created = await res.json()
        eventId = created.id ?? null
      }
    }

    if (eventId) {
      await supabase.from('planning').update({ google_event_id: eventId }).eq('id', planning_id)
    }

    return NextResponse.json({ ok: true, event_id: eventId, uitnodigingen_verstuurd: attendees.length })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
