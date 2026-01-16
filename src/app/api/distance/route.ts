import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

type DistanceRequest = {
  from: string
  to: string
}

const pickSupabaseAccessToken = async (req: Request) => {
  const authHeader = req.headers.get('authorization')
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1]
  }

  const cookieStore = await cookies()
  const authCookie = cookieStore
    .getAll()
    .find((c) => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'))

  if (!authCookie) return undefined

  try {
    const session = JSON.parse(decodeURIComponent(authCookie.value))
    return session?.access_token
  } catch {
    return undefined
  }
}

const geocode = async (apiKey: string, text: string) => {
  const url =
    'https://api.openrouteservice.org/geocode/search?' +
    new URLSearchParams({
      text,
      size: '1',
    })

  const res = await fetch(url, {
    headers: {
      Authorization: apiKey,
      Accept: 'application/json',
    },
    // ORS responses are stable enough to cache briefly
    next: { revalidate: 60 * 60 },
  })

  if (!res.ok) {
    const body = await res.text()
    return { ok: false as const, status: res.status, body }
  }

  const json: any = await res.json()
  const coords = json?.features?.[0]?.geometry?.coordinates
  if (!Array.isArray(coords) || coords.length < 2) {
    return { ok: false as const, status: 404, body: 'not_found' }
  }

  const [lon, lat] = coords
  if (typeof lon !== 'number' || typeof lat !== 'number') {
    return { ok: false as const, status: 404, body: 'not_found' }
  }

  return { ok: true as const, lon, lat }
}

const drivingDistanceMeters = async (
  apiKey: string,
  start: { lon: number; lat: number },
  end: { lon: number; lat: number }
) => {
  const url =
    'https://api.openrouteservice.org/v2/directions/driving-car?' +
    new URLSearchParams({
      start: `${start.lon},${start.lat}`,
      end: `${end.lon},${end.lat}`,
    })

  const res = await fetch(url, {
    headers: {
      Authorization: apiKey,
      Accept: 'application/json',
    },
    next: { revalidate: 60 * 60 },
  })

  if (!res.ok) {
    const body = await res.text()
    return { ok: false as const, status: res.status, body }
  }

  const json: any = await res.json()
  const meters = json?.features?.[0]?.properties?.summary?.distance
  if (typeof meters !== 'number') {
    return { ok: false as const, status: 500, body: 'invalid_response' }
  }

  return { ok: true as const, meters }
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.ORS_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'missing_ors_api_key' },
        { status: 500 }
      )
    }

    // Auth required: prevents abuse of your routing quota
    const supabaseAccessToken = await pickSupabaseAccessToken(req)
    if (!supabaseAccessToken) {
      return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const {
      data: { user },
    } = await supabase.auth.getUser(supabaseAccessToken)

    if (!user) {
      return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
    }

    const body = (await req.json()) as DistanceRequest
    const from = String(body?.from ?? '').trim()
    const to = String(body?.to ?? '').trim()

    if (!from || !to) {
      return NextResponse.json(
        { error: 'missing_from_or_to' },
        { status: 400 }
      )
    }

    const fromGeo = await geocode(apiKey, from)
    if (!fromGeo.ok) {
      return NextResponse.json(
        { error: 'from_not_found', details: fromGeo.body },
        { status: 400 }
      )
    }

    const toGeo = await geocode(apiKey, to)
    if (!toGeo.ok) {
      return NextResponse.json(
        { error: 'to_not_found', details: toGeo.body },
        { status: 400 }
      )
    }

    const dist = await drivingDistanceMeters(apiKey, fromGeo, toGeo)
    if (!dist.ok) {
      return NextResponse.json(
        { error: 'distance_error', details: dist.body },
        { status: 500 }
      )
    }

    const km = Math.round((dist.meters / 1000) * 10) / 10

    return NextResponse.json({ km })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'unexpected_error', details: String(err?.message ?? err) },
      { status: 500 }
    )
  }
}
