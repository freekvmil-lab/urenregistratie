import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

type DistanceRequest = {
  from: string
  to: string
}

type GeoCandidate = {
  lon: number
  lat: number
  label?: string | null
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

const geocodeMany = async (apiKey: string, text: string) => {
  const url =
    'https://api.openrouteservice.org/geocode/search?' +
    new URLSearchParams({
      text,
      size: '5',
      // These help a lot for NL addresses; if you work abroad, you can remove them.
      'boundary.country': 'NL',
      layers: 'address,street,venue',
    })

  const res = await fetch(url, {
    headers: {
      Authorization: apiKey,
      Accept: 'application/json',
    },
    cache: 'no-store',
  })

  if (!res.ok) {
    const body = await res.text()
    return { ok: false as const, status: res.status, body }
  }

  const json: any = await res.json()
  const feats: any[] = Array.isArray(json?.features) ? json.features : []
  const candidates: GeoCandidate[] = feats
    .map((f) => {
      const coords = f?.geometry?.coordinates
      if (!Array.isArray(coords) || coords.length < 2) return null
      const [lon, lat] = coords
      if (typeof lon !== 'number' || typeof lat !== 'number') return null
      const label =
        f?.properties?.label ??
        f?.properties?.name ??
        f?.properties?.label_text ??
        null
      return { lon, lat, label }
    })
    .filter(Boolean) as GeoCandidate[]

  if (candidates.length === 0) {
    return { ok: false as const, status: 404, body: 'not_found' }
  }

  return { ok: true as const, candidates }
}

const drivingDistanceMeters = async (
  apiKey: string,
  start: { lon: number; lat: number },
  end: { lon: number; lat: number }
) => {
  const url = 'https://api.openrouteservice.org/v2/directions/driving-car'

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      coordinates: [
        [start.lon, start.lat],
        [end.lon, end.lat],
      ],
      // Helps when geocoding returns a point slightly off the road network.
      radiuses: [300, 300],
      instructions: false,
    }),
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text()
    const snippet = String(text ?? '').slice(0, 600)
    let parsed: any = null
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = null
    }

    const message =
      parsed?.error?.message ??
      parsed?.error?.errors?.[0]?.message ??
      parsed?.message ??
      null
    const code = parsed?.error?.code ?? parsed?.error?.errors?.[0]?.code ?? null

    return {
      ok: false as const,
      status: res.status,
      body: text,
      snippet,
      message,
      code,
    }
  }

  const json: any = await res.json()
  const meters = json?.features?.[0]?.properties?.summary?.distance
  if (typeof meters !== 'number') {
    return { ok: false as const, status: 500, body: 'invalid_response' }
  }

  return { ok: true as const, meters }
}

const haversineKm = (a: { lon: number; lat: number }, b: { lon: number; lat: number }) => {
  const R = 6371
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.asin(Math.min(1, Math.sqrt(h)))
  return R * c
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
      error: userError,
    } = await supabase.auth.getUser(supabaseAccessToken)

    if (userError || !user) {
      return NextResponse.json(
        { error: 'not_authenticated', details: userError?.message ?? null },
        { status: 401 }
      )
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

    const fromGeo = await geocodeMany(apiKey, from)
    if (!fromGeo.ok) {
      if (fromGeo.status === 404) {
        return NextResponse.json(
          { error: 'from_not_found', details: fromGeo.body },
          { status: 400 }
        )
      }

      return NextResponse.json(
        {
          error: 'ors_geocode_error',
          which: 'from',
          upstream_status: fromGeo.status,
          details: fromGeo.body,
        },
        { status: 502 }
      )
    }

    const toGeo = await geocodeMany(apiKey, to)
    if (!toGeo.ok) {
      if (toGeo.status === 404) {
        return NextResponse.json(
          { error: 'to_not_found', details: toGeo.body },
          { status: 400 }
        )
      }

      return NextResponse.json(
        {
          error: 'ors_geocode_error',
          which: 'to',
          upstream_status: toGeo.status,
          details: toGeo.body,
        },
        { status: 502 }
      )
    }

    const fromCandidates = fromGeo.candidates.slice(0, 3)
    const toCandidates = toGeo.candidates.slice(0, 3)

    let lastDistError: any = null
    for (const fc of fromCandidates) {
      for (const tc of toCandidates) {
        // Retry a couple times on transient ORS 5xx
        for (let attempt = 0; attempt < 2; attempt++) {
          const dist = await drivingDistanceMeters(apiKey, fc, tc)
          if (dist.ok) {
            const km = Math.round((dist.meters / 1000) * 10) / 10
            return NextResponse.json({
              km,
              approximate: false,
              from_label: fc.label ?? null,
              to_label: tc.label ?? null,
            })
          }

          lastDistError = { dist, fc, tc }

          if (dist.status >= 500) {
            // small backoff
            await new Promise((r) => setTimeout(r, 150 * (attempt + 1)))
            continue
          }

          // For 4xx, trying a different candidate usually helps more than retrying.
          break
        }
      }
    }

    // If we get here: no candidate combination produced a route
    const dist = lastDistError?.dist
    const fc = lastDistError?.fc
    const tc = lastDistError?.tc
    if (dist && !dist.ok) {
      // Helpful for local dev debugging; safe to log a short snippet only.
      console.error('ORS directions error', {
        upstream_status: dist.status,
        ors_code: (dist as any).code ?? null,
        ors_message: (dist as any).message ?? null,
        snippet: (dist as any).snippet ?? null,
        from: fc ? { lon: fc.lon, lat: fc.lat } : null,
        to: tc ? { lon: tc.lon, lat: tc.lat } : null,
      })

      // Optional fallback (off by default). Set KM_ALLOW_APPROX=true to enable.
      if (dist.status >= 500 && process.env.KM_ALLOW_APPROX === 'true' && fc && tc) {
        const straightKm = haversineKm({ lon: fc.lon, lat: fc.lat }, { lon: tc.lon, lat: tc.lat })
        const approxKm = Math.round(straightKm * 1.25 * 10) / 10
        return NextResponse.json({
          km: approxKm,
          approximate: true,
          from_coords: { lon: fc.lon, lat: fc.lat },
          to_coords: { lon: tc.lon, lat: tc.lat },
          note: 'fallback_haversine',
        })
      }

      return NextResponse.json(
        {
          error: 'ors_directions_error',
          upstream_status: dist.status,
          ors_code: (dist as any).code ?? null,
          ors_message: (dist as any).message ?? null,
          ors_details_snippet: (dist as any).snippet ?? null,
          from_coords: fc ? { lon: fc.lon, lat: fc.lat } : null,
          to_coords: tc ? { lon: tc.lon, lat: tc.lat } : null,
          details: dist.body,
        },
        { status: 502 }
      )
    }

    return NextResponse.json(
      { error: 'ors_directions_error', upstream_status: 500, details: 'unknown' },
      { status: 502 }
    )
  } catch (err: any) {
    return NextResponse.json(
      { error: 'unexpected_error', details: String(err?.message ?? err) },
      { status: 500 }
    )
  }
}
