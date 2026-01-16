import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

type DistanceRequest = {
  from: string
  to: string
  roundTrip?: boolean
}

type GeoCandidate = {
  lon: number
  lat: number
  label?: string | null
  confidence?: number | null
  layer?: string | null
  housenumber?: string | null
  postalcode?: string | null
}

const normalizeNlPostalCodes = (input: string) => {
  // Convert e.g. "3645BA" -> "3645 BA" (helps geocoders)
  return input.replace(/\b(\d{4})\s*([A-Za-z]{2})\b/g, (_m, a, b) => `${a} ${String(b).toUpperCase()}`)
}

const formatCandidateLabel = (c: GeoCandidate | null | undefined) => {
  if (!c) return null
  const base = String(c.label ?? '').trim()
  if (!base) return null

  let out = base

  // If ORS already includes the housenumber, do nothing.
  const hn = String(c.housenumber ?? '').trim()
  if (hn && !new RegExp(`\\b${hn.replace(/[-/\\\\^$*+?.()|[\\]{}]/g, '\\\\$&')}\\b`).test(out)) {
    const idx = out.indexOf(',')
    if (idx >= 0) {
      out = `${out.slice(0, idx).trim()} ${hn}${out.slice(idx)}`
    } else {
      out = `${out} ${hn}`
    }
  }

  const pc = String(c.postalcode ?? '').trim()
  if (pc && !new RegExp(`\\b${pc.replace(/[-/\\\\^$*+?.()|[\\]{}]/g, '\\\\$&')}\\b`, 'i').test(out)) {
    // Prefer inserting postal code early (after first comma) if possible.
    const idx = out.indexOf(',')
    if (idx >= 0) {
      out = `${out.slice(0, idx + 1)} ${pc}${out.slice(idx + 1)}`
    } else {
      out = `${out}, ${pc}`
    }
  }

  return out
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
  const normalized = normalizeNlPostalCodes(text)
  const url =
    'https://api.openrouteservice.org/geocode/search?' +
    new URLSearchParams({
      text: normalized,
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
  const rawCandidates: GeoCandidate[] = feats
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
      const confidence =
        typeof f?.properties?.confidence === 'number'
          ? f.properties.confidence
          : null
      const layer = typeof f?.properties?.layer === 'string' ? f.properties.layer : null
      const housenumber =
        typeof f?.properties?.housenumber === 'string'
          ? f.properties.housenumber
          : null
      const postalcode =
        typeof f?.properties?.postalcode === 'string'
          ? f.properties.postalcode
          : null

      return { lon, lat, label, confidence, layer, housenumber, postalcode }
    })
    .filter(Boolean) as GeoCandidate[]

  const scoreCandidate = (c: GeoCandidate) => {
    const label = String(c.label ?? '').toLowerCase()
    const wantsHouseNumber = /\b\d+\b/.test(normalized)
    const wantsPostal = /\b\d{4}\s*[a-z]{2}\b/i.test(normalized)

    const hasHouseNumber = Boolean(c.housenumber) || (wantsHouseNumber && /\b\d+\b/.test(label))
    const hasPostal = Boolean(c.postalcode) || (wantsPostal && /\b\d{4}\s*[a-z]{2}\b/i.test(label))

    // Rank order: address layer > street > venue/other
    const layerBoost = c.layer === 'address' ? 50 : c.layer === 'street' ? 20 : 0
    const houseBoost = hasHouseNumber ? 40 : 0
    const postalBoost = hasPostal ? 25 : 0
    const conf = typeof c.confidence === 'number' ? c.confidence : 0

    return layerBoost + houseBoost + postalBoost + conf
  }

  const candidates = rawCandidates
    .slice()
    .sort((a, b) => scoreCandidate(b) - scoreCandidate(a))

  if (candidates.length === 0) {
    return { ok: false as const, status: 404, body: 'not_found' }
  }

  return { ok: true as const, candidates }
}

const drivingDistanceMeters = async (
  apiKey: string,
  start: { lon: number; lat: number },
  end: { lon: number; lat: number },
  radiuses?: [number, number]
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
      ...(radiuses ? { radiuses } : {}),
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
  const meters =
    // ORS v2 directions schema
    json?.routes?.[0]?.summary?.distance ??
    // Some ORS responses / other endpoints use GeoJSON features
    json?.features?.[0]?.properties?.summary?.distance
  if (typeof meters !== 'number') {
    return { ok: false as const, status: 500, body: 'invalid_response' }
  }

  return { ok: true as const, meters }
}

const tryDrivingDistanceMeters = async (
  apiKey: string,
  start: { lon: number; lat: number },
  end: { lon: number; lat: number }
) => {
  // Variants:
  // - small snap radius (often enough)
  // - larger snap radius (for industrial areas / odd geocodes)
  // - no radiuses at all (in case radiuses triggers an ORS edge-case)
  const variants: Array<[number, number] | undefined> = [[300, 300], [1000, 1000], undefined]

  let last: any = null
  for (const v of variants) {
    // retry transient ORS 5xx a few times
    for (let attempt = 0; attempt < 3; attempt++) {
      const dist = await drivingDistanceMeters(apiKey, start, end, v)
      if (dist.ok) return dist
      last = dist

      if (dist.status >= 500) {
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)))
        continue
      }

      // 4xx: try next variant
      break
    }
  }

  return last
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
    const roundTrip = Boolean(body?.roundTrip)

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
          const dist = await tryDrivingDistanceMeters(apiKey, fc, tc)
          if (dist.ok) {
            const oneWayKm = Math.round((dist.meters / 1000) * 10) / 10
            const km = roundTrip ? Math.round(oneWayKm * 2 * 10) / 10 : oneWayKm
            return NextResponse.json({
              km,
              approximate: false,
              one_way_km: oneWayKm,
              round_trip: roundTrip,
              from_label: formatCandidateLabel(fc) ?? fc.label ?? null,
              to_label: formatCandidateLabel(tc) ?? tc.label ?? null,
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
