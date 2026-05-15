import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const getServiceClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://shxlihgfdzfxwjewjnmj.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

async function maakGoogleEvent(accessToken: string, event: object) {
  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  })
  return res.json()
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { planning_id } = body

    const supabase = getServiceClient()

    const { data: planning } = await supabase
      .from('planning')
      .select('*, planning_medewerkers(medewerker_id, medewerker_naam)')
      .eq('id', planning_id)
      .single()

    if (!planning) return NextResponse.json({ error: 'planning_not_found' }, { status: 404 })

    const startDateTime = `${planning.datum}T${planning.start_tijd}`
    const endDateTime = `${planning.datum}T${planning.eind_tijd}`

    const medewerkerNamen = (planning.planning_medewerkers as PlanningMedewerker[])
      .map((m) => m.medewerker_naam ?? '')
      .join(', ')

    const eventBody = {
      summary: `${planning.titel}${planning.opdrachtgever_naam ? ` - ${planning.opdrachtgever_naam}` : ''}`,
      location: planning.locatie ?? undefined,
      description: `Medewerkers: ${medewerkerNamen}\n${planning.notities ?? ''}`,
      start: { dateTime: startDateTime, timeZone: 'Europe/Amsterdam' },
      end: { dateTime: endDateTime, timeZone: 'Europe/Amsterdam' },
    }

    const { data: adminTokenRow } = await supabase
      .from('google_tokens')
      .select('user_id')
      .limit(1)
      .single()

    let adminEventId = null
    if (adminTokenRow) {
      const accessToken = await getValidAccessToken((adminTokenRow as { user_id: string }).user_id, supabase)
      if (accessToken) {
        const created = await maakGoogleEvent(accessToken, eventBody)
        adminEventId = created.id ?? null
      }
    }

    if (adminEventId) {
      await supabase.from('planning').update({ google_event_id: adminEventId }).eq('id', planning_id)
    }

    for (const pm of (planning.planning_medewerkers as PlanningMedewerker[])) {
      const token = await getValidAccessToken(pm.medewerker_id, supabase)
      if (token) {
        const created = await maakGoogleEvent(token, eventBody)
        if (created.id) {
          await supabase.from('planning_medewerkers')
            .update({ google_event_id: created.id })
            .eq('planning_id', planning_id)
            .eq('medewerker_id', pm.medewerker_id)
        }
      }
    }

    return NextResponse.json({ ok: true, event_id: adminEventId })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
