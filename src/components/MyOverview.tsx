'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

/* =======================
   TYPES
======================= */

interface Entry {
  id: number
  user_id: string
  date: string
  start_time: string
  end_time: string | null
  edited?: boolean
  approved?: boolean
  manual?: boolean
  client?: string | null
  client_id?: string | null
  location?: string | null
  kilometers?: number | null
  parking_paid?: boolean | null
  parking_cost?: number | null
}

interface ClientRow {
  id: string
  name: string
}

/* =======================
   HELPERS
======================= */

const canEdit = (date: string) =>
  (Date.now() - new Date(date).getTime()) /
    (1000 * 60 * 60 * 24) <= 3

const toLocalISOString = (date: string, time: string) => {
  const [h, m] = time.split(':').map(Number)
  const d = new Date(date)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

const toLocalYmd = (d: Date) => {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const parseYmdToLocalDate = (ymd: string) => {
  const [y, m, d] = String(ymd).split('-').map((x) => Number(x))
  if (!y || !m || !d) return new Date(ymd)
  const dt = new Date(y, m - 1, d)
  dt.setHours(0, 0, 0, 0)
  return dt
}

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString('nl-NL', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  })

const formatTime = (d: string | null) =>
  d
    ? new Date(d).toLocaleTimeString('nl-NL', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'

const hours = (s: string, e: string | null) =>
  e ? (new Date(e).getTime() - new Date(s).getTime()) / 3600000 : 0

const needsDetails = (e: Entry) => {
  if (e.manual) return false
  // Only nudge after the shift is stopped
  if (!e.end_time) return false

  const missingClient = !(e.client_id && String(e.client_id).trim()) && (!e.client || !String(e.client).trim())
  const missingLocation = !e.location || !String(e.location).trim()
  const parkingMissingCost = Boolean(e.parking_paid) && (e.parking_cost === null || e.parking_cost === undefined)

  return missingClient || missingLocation || parkingMissingCost
}

/* =======================
   COMPONENT
======================= */

export default function MyOverview({ userId }: { userId?: string }) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [clients, setClients] = useState<ClientRow[]>([])
  const [manualError, setManualError] = useState<string | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [homeAddress, setHomeAddress] = useState<string>('')
  const [kmLoading, setKmLoading] = useState<'edit' | 'manual' | null>(null)
  const [kmInfoEdit, setKmInfoEdit] = useState<string | null>(null)
  const [kmInfoManual, setKmInfoManual] = useState<string | null>(null)

  const [currentWeek, setCurrentWeek] = useState(() => {
    const d = new Date()
    const day = d.getDay() || 7
    d.setDate(d.getDate() - day + 1)
    d.setHours(0, 0, 0, 0)
    return d
  })

  /* ===== EDIT ===== */
  const [editing, setEditing] = useState<Entry | null>(null)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [manual, setManual] = useState(false)
  const [manualDate, setManualDate] = useState('')
  const [manualStart, setManualStart] = useState('')
  const [manualEnd, setManualEnd] = useState('')
  const [clientId, setClientId] = useState<string>('')
  const [clientText, setClientText] = useState<string>('')
  const [location, setLocation] = useState('')
  const [editKilometers, setEditKilometers] = useState<number | ''>('')
  const [editRoundTrip, setEditRoundTrip] = useState(true)
  const [editParkingPaid, setEditParkingPaid] = useState(false)
  const [editParkingCost, setEditParkingCost] = useState<number | ''>('')
  const [manualKilometers, setManualKilometers] = useState<number | ''>('')
  const [manualRoundTrip, setManualRoundTrip] = useState(true)
  const [manualParkingPaid, setManualParkingPaid] = useState(false)
  const [manualParkingCost, setManualParkingCost] = useState<number | ''>('')

  /* =======================
     FETCH
  ======================= */

  const fetchEntries = async () => {
    if (!userId) return
    setLoading(true)

    const { data } = await supabase
      .from('time_entries')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })

    if (data) setEntries(data)
    setLoading(false)
  }

  const fetchClients = async () => {
    if (!userId) {
      setClients([])
      return
    }

    // Try to load assigned clients for this employee.
    // If none are assigned (or table doesn't exist yet), fall back to all clients.
    let assignedIds: string[] | null = null
    try {
      const { data: assignmentData, error: assignmentError } = await supabase
        .from('employee_clients')
        .select('client_id')
        .eq('employee_id', userId)

      if (!assignmentError) {
        const ids = (assignmentData ?? [])
          .map((r: any) => String(r.client_id ?? '').trim())
          .filter((id: string) => id)
        if (ids.length > 0) assignedIds = ids
      }
    } catch {
      // ignore
    }

    let data: any[] | null = null
    let error: any = null

    if (assignedIds && assignedIds.length > 0) {
      const res = await supabase
        .from('clients')
        .select('id, name')
        .in('id', assignedIds)
        .order('name', { ascending: true })
      data = res.data as any[] | null
      error = res.error

      // Fallback in case RLS blocks the filtered query.
      if (error) {
        assignedIds = null
      }
    }

    if (!assignedIds) {
      const res = await supabase
        .from('clients')
        .select('id, name')
        .order('name', { ascending: true })
      data = res.data as any[] | null
      error = res.error
    }

    if (error) {
      // If RLS blocks SELECT, don't break manual entry; just hide suggestions.
      setClients([])
      return
    }

    const rows = (data ?? []) as any[]
    const mapped = rows
      .map((r) => ({ id: String(r.id), name: String(r.name) }))
      .filter((r) => r.id && r.name)
    // de-dupe by id
    const seen = new Set<string>()
    const uniq: ClientRow[] = []
    for (const c of mapped) {
      if (seen.has(c.id)) continue
      seen.add(c.id)
      uniq.push(c)
    }
    setClients(uniq)
  }

  const fetchRole = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setIsAdmin(false)
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, home_address')
      .eq('id', user.id)
      .single()

    setIsAdmin(profile?.role === 'admin')
    setHomeAddress(String(profile?.home_address ?? '').trim())
  }

  useEffect(() => {
    fetchEntries()
  }, [userId])

  useEffect(() => {
    fetchClients()
    fetchRole()
  }, [])

  const getAccessToken = async () => {
    const { data } = await supabase.auth.getSession()
    return data?.session?.access_token ?? null
  }

  const calculateKm = async (mode: 'edit' | 'manual') => {
    const from = String(homeAddress ?? '').trim()
    const to = String(location ?? '').trim()
    const roundTrip = mode === 'edit' ? editRoundTrip : manualRoundTrip

    if (!from) {
      const msg = 'Thuisadres ontbreekt. Laat een admin het thuisadres invullen bij Werknemers.'
      if (mode === 'edit') setEditError(msg)
      else setManualError(msg)
      return
    }

    if (!to) {
      const msg = 'Vul eerst een locatie in om kilometers te berekenen.'
      if (mode === 'edit') setEditError(msg)
      else setManualError(msg)
      return
    }

    try {
      setKmLoading(mode)
      if (mode === 'edit') setEditError(null)
      else setManualError(null)
      if (mode === 'edit') setKmInfoEdit(null)
      else setKmInfoManual(null)

      const token = await getAccessToken()
      const res = await fetch('/api/distance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ from, to, roundTrip }),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        const upstream = json?.upstream_status ? ` (ORS ${json.upstream_status})` : ''
        const orsExtra =
          json?.ors_message || json?.ors_code
            ? ` (${String(json?.ors_code ?? '—')}: ${String(json?.ors_message ?? '').slice(0, 160)})`
            : json?.ors_details_snippet
              ? ` (${String(json.ors_details_snippet).slice(0, 160)})`
              : json?.from_coords && json?.to_coords
                ? ` (coords: ${json.from_coords.lon},${json.from_coords.lat} → ${json.to_coords.lon},${json.to_coords.lat})`
              : ''
        let msg: string

        switch (json?.error) {
          case 'not_authenticated':
            msg = 'Niet ingelogd of sessie verlopen. Herlaad de pagina en log opnieuw in.'
            break
          case 'to_not_found':
            msg = 'Locatie niet gevonden. Probeer iets specifieker (straat + plaats).'
            break
          case 'from_not_found':
            msg = 'Thuisadres niet gevonden. Controleer het thuisadres bij Werknemers.'
            break
          case 'missing_ors_api_key':
            msg = 'Kilometers berekenen is nog niet geconfigureerd (ORS_API_KEY ontbreekt op de server).'
            break
          case 'ors_geocode_error':
            msg = `Kaart-service fout bij adres opzoeken${upstream}. Controleer ORS_API_KEY/quota en probeer opnieuw.`
            break
          case 'ors_directions_error':
            msg = `Kaart-service fout bij route berekenen${upstream}${orsExtra}.`
            break
          default:
            msg = `Kilometers berekenen mislukt (${String(json?.error ?? 'unknown')}).`
            break
        }

        if (mode === 'edit') setEditError(msg)
        else setManualError(msg)
        return
      }

      const km = Number(json?.km)
      if (!Number.isFinite(km)) {
        if (mode === 'edit') setEditError('Kilometers berekenen gaf een ongeldig resultaat.')
        else setManualError('Kilometers berekenen gaf een ongeldig resultaat.')
        return
      }

      if (mode === 'edit') setEditKilometers(km)
      else setManualKilometers(km)

      if (json?.approximate === true) {
        const info = 'Let op: ORS gaf een fout, kilometers zijn geschat (≈). Controleer eventueel handmatig.'
        if (mode === 'edit') setKmInfoEdit(info)
        else setKmInfoManual(info)
      }
    } finally {
      setKmLoading(null)
    }
  }

  const clientsById = new Map(clients.map((c) => [c.id, c]))
  const clientsByNameLower = new Map(clients.map((c) => [c.name.trim().toLowerCase(), c]))

  const displayClientName = (e: Entry) => {
    const id = String(e.client_id ?? '').trim()
    if (id) {
      const row = clientsById.get(id)
      if (row?.name) return row.name
    }
    const raw = String(e.client ?? '').trim()
    return raw || null
  }

  const isKnownClientName = (name: string | null | undefined) => {
    const raw = String(name ?? '').trim()
    if (!raw) return true
    return clientsByNameLower.has(raw.toLowerCase())
  }

  const validateClientForEmployee = () => {
    if (isAdmin) return { ok: true as const }
    // For employees, client must be selected from the dropdown (clientId) or left empty.
    if (!clientId) return { ok: true as const }
    if (!clientsById.has(clientId)) {
      return {
        ok: false as const,
        message:
          'Onbekende opdrachtgever. Kies een bestaande opdrachtgever (admins beheren de lijst via Admin → Opdrachtgevers).',
      }
    }
    return { ok: true as const }
  }

  const toFriendlyClientRlsError = (err: any) => {
    if (!err) return null
    if (err.code !== '42501') return null
    const msg = String(err.message ?? '')
    if (!msg.toLowerCase().includes('clients')) return null
    return 'Je hebt geen rechten om automatisch een nieuwe opdrachtgever aan te maken. Kies een bestaande opdrachtgever, of vraag een admin om deze toe te voegen via Admin → Opdrachtgevers.'
  }

  const openEdit = (e: Entry) => {
    setEditError(null)
    setEditing(e)
    setStart(
      new Date(e.start_time).toLocaleTimeString('nl-NL', {
        hour: '2-digit',
        minute: '2-digit',
      })
    )
    setEnd(
      e.end_time
        ? new Date(e.end_time).toLocaleTimeString('nl-NL', {
            hour: '2-digit',
            minute: '2-digit',
          })
        : ''
    )
    const existingClientId = e.client_id ?? null
    if (existingClientId && clientsById.has(existingClientId)) {
      setClientId(existingClientId)
    } else if (e.client && isKnownClientName(e.client)) {
      setClientId(clientsByNameLower.get(e.client.trim().toLowerCase())!.id)
    } else {
      setClientId('')
    }

    // Text input is admin-only convenience; default to current visible client name.
    setClientText(e.client ?? '')
    setLocation(e.location ?? '')
    setEditKilometers(e.kilometers ?? '')
    setEditParkingPaid(Boolean(e.parking_paid))
    setEditParkingCost(e.parking_cost ?? '')
  }

  const ensureClientIdForAdmin = async (): Promise<{ id: string | null; error?: string }> => {
    // Priority: selected existing client
    if (clientId) {
      return { id: clientId }
    }

    const name = clientText.trim()
    if (!name) return { id: null }

    // If it already exists (case-insensitive), reuse
    const existing = clientsByNameLower.get(name.toLowerCase())
    if (existing) return { id: existing.id }

    // Admin convenience: create new client row
    const { data, error } = await supabase
      .from('clients')
      .insert({ name })
      .select('id, name')
      .single()

    if (error) {
      return { id: null, error: error.message || 'Opdrachtgever aanmaken mislukt' }
    }

    const createdId = String((data as any)?.id ?? '')
    const createdName = String((data as any)?.name ?? name)
    if (createdId) {
      // update local list so dropdown stays in sync
      setClients((prev) => {
        if (prev.some((c) => c.id === createdId)) return prev
        return [...prev, { id: createdId, name: createdName }].sort((a, b) => a.name.localeCompare(b.name))
      })
      setClientId(createdId)
      return { id: createdId }
    }

    return { id: null, error: 'Opdrachtgever aanmaken mislukt' }
  }

  const saveEdit = async () => {
    if (!editing) return
    setEditError(null)

    const v = validateClientForEmployee()
    if (!v.ok) {
      setEditError(v.message)
      return
    }

    const payload: any = {
      start_time: toLocalISOString(editing.date, start),
      end_time: toLocalISOString(editing.date, end),
      location: location || null,
      kilometers: editKilometers || null,
      parking_paid: editParkingPaid,
      parking_cost: editParkingPaid ? editParkingCost : null,
      edited: true,
      approved: false,
    }

    if (isAdmin) {
      const { id, error } = await ensureClientIdForAdmin()
      if (error) {
        setEditError(error)
        return
      }
      // Use client_id; DB trigger sync_time_entries_client_from_id will keep text in sync.
      payload.client_id = id
      // If admin cleared selection and text, explicitly clear legacy client too.
      if (!id && !clientText.trim()) payload.client = null
    } else {
      // Employees: only touch client_id if they selected one. Otherwise preserve legacy.
      if (clientId) {
        payload.client_id = clientId
      }
    }

    const { data, error } = await supabase
      .from('time_entries')
      .update(payload)
      .eq('id', editing.id)
      .select('id')

    if (error) {
      setEditError(toFriendlyClientRlsError(error) ?? (error.message || 'Opslaan mislukt'))
      return
    }

    if (!data || (Array.isArray(data) && data.length === 0)) {
      setEditError('Opslaan faalde door rechten (RLS). Voeg een admin UPDATE policy toe op time_entries.')
      return
    }

    setEditing(null)
    fetchEntries()
  }

  const saveManual = async () => {
    if (!userId) return
    setManualError(null)

    const v = validateClientForEmployee()
    if (!v.ok) {
      setManualError(v.message)
      return
    }

    const manualPayload: any = {
      user_id: userId,
      date: manualDate,
      start_time: toLocalISOString(manualDate, manualStart),
      end_time: toLocalISOString(manualDate, manualEnd),
      manual: true,
      edited: true,
      approved: false,
      location: location || null,
      kilometers: manualKilometers || null,
      parking_paid: manualParkingPaid,
      parking_cost: manualParkingPaid ? manualParkingCost : null,
    }

    if (isAdmin) {
      const { id, error: cErr } = await ensureClientIdForAdmin()
      if (cErr) {
        setManualError(cErr)
        return
      }
      manualPayload.client_id = id
      if (!id && !clientText.trim()) manualPayload.client = null
    } else {
      if (clientId) manualPayload.client_id = clientId
    }

    const { data, error } = await supabase
      .from('time_entries')
      .insert(manualPayload)
      .select('id')

    if (error) {
      setManualError(toFriendlyClientRlsError(error) ?? (error.message || 'Opslaan mislukt'))
      return
    }

    if (!data || (Array.isArray(data) && data.length === 0)) {
      setManualError('Opslaan faalde door rechten (RLS).')
      return
    }

    setManual(false)
    fetchEntries()
  }

  useEffect(() => {
    const handler = (ev: any) => {
      const date = ev?.detail?.date ?? toLocalYmd(new Date())
      setManualDate(date)
      setManualError(null)
      setManualRoundTrip(true)
      setManual(true)
    }

    window.addEventListener('openManual', handler as EventListener)
    return () => window.removeEventListener('openManual', handler as EventListener)
  }, [])

  useEffect(() => {
    const handler = (ev: any) => {
      const startIso = ev?.detail?.start
      const endIso = ev?.detail?.end
      const title = String(ev?.detail?.title ?? '')
      const eventLocation = ev?.detail?.location ?? null
      const isAllDay = Boolean(ev?.detail?.isAllDay)

      if (!startIso || !endIso) {
        // fallback: just open manual for today
        const d = new Date()
        setManualDate(toLocalYmd(d))
        setManualRoundTrip(true)
        setManual(true)
        return
      }

      setManual(true)
      setManualError(null)
      setManualRoundTrip(true)
      const s = new Date(startIso)
      const en = new Date(endIso)

      setManualDate(toLocalYmd(s))
      if (isAllDay) {
        setManualStart('09:00')
        setManualEnd('17:00')
      } else {
        setManualStart(
          s.toLocaleTimeString('nl-NL', {
            hour: '2-digit',
            minute: '2-digit',
          })
        )
        setManualEnd(
          en.toLocaleTimeString('nl-NL', {
            hour: '2-digit',
            minute: '2-digit',
          })
        )
      }

      // If title looks like "OPDRACHTGEVER - rest", set opdrachtgever automatically
      const [maybeClient] = title.split(' - ', 1)
      const name = String(maybeClient ?? '').trim()
      if (!name) {
        setClientId('')
        setClientText('')
      } else {
        const existing = clientsByNameLower.get(name.toLowerCase())
        if (existing) {
          setClientId(existing.id)
          setClientText(existing.name)
        } else {
          setClientId('')
          setClientText(name)
        }
      }
      setLocation(eventLocation ?? '')
      setManualKilometers('')
      setManualParkingPaid(false)
      setManualParkingCost('')
    }

    window.addEventListener('openManualPrefill', handler as EventListener)
    return () => window.removeEventListener('openManualPrefill', handler as EventListener)
  }, [])

  if (!userId) return <p>Gebruiker laden…</p>
  if (loading) return <p>Overzicht laden…</p>

  /* =======================
     FILTERS
  ======================= */

  const weekStart = new Date(currentWeek)
  const weekEnd = new Date(currentWeek)
  weekEnd.setDate(weekEnd.getDate() + 6)

  const weekEntries = entries.filter((e) => {
    const d = parseYmdToLocalDate(e.date)
    return d >= weekStart && d <= weekEnd
  })

  const grouped = weekEntries.reduce<Record<string, Entry[]>>(
    (acc, e) => {
      acc[e.date] = acc[e.date] || []
      acc[e.date].push(e)
      return acc
    },
    {}
  )

  const weekTotal = weekEntries.reduce(
    (s, e) => s + hours(e.start_time, e.end_time),
    0
  )

  /* =======================
     RENDER
  ======================= */

  return (
    <div className="mt-6 space-y-6">
      {/* HEADER */}
      <div className="flex justify-between items-center">
        <button
          onClick={() =>
            setCurrentWeek(
              new Date(currentWeek.setDate(currentWeek.getDate() - 7))
            )
          }
        >
          ← Vorige
        </button>

        <strong>
          Week van {weekStart.toLocaleDateString('nl-NL')}
        </strong>

        <button
          onClick={() =>
            setCurrentWeek(
              new Date(currentWeek.setDate(currentWeek.getDate() + 7))
            )
          }
        >
          Volgende →
        </button>
      </div>

      <p className="font-bold">
        Totaal: {weekTotal.toFixed(2)} uur
      </p>

      {/* DAYS */}
      {Object.entries(grouped).map(([date, list]) => {
        const dayTotal = list.reduce(
          (s, e) => s + hours(e.start_time, e.end_time),
          0
        )

        return (
          <div
            key={date}
            className="bg-black/30 border border-gray-700 rounded-lg p-4 space-y-3"
          >
            <div className="flex justify-between font-medium">
              <span>{formatDate(date)}</span>
              <span>{dayTotal.toFixed(2)} uur</span>
            </div>

            {/* inline start/stop is rendered in TimeTracker; no duplicate here */}

                <datalist id="client-list">
                  {clients.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>

            {list.map((e) => (
              <div
                key={e.id}
                className="border-t border-gray-700 pt-2 space-y-1 text-sm"
              >
                <div className="flex justify-between">
                  <span>
                    {formatTime(e.start_time)} –{' '}
                    {formatTime(e.end_time)}
                  </span>

                  {canEdit(e.date) && !e.approved && (
                    <button
                      onClick={() => openEdit(e)}
                      className="text-orange-500"
                    >
                      ✏️
                    </button>
                  )}

                  {editing && (
                    <div className="fixed inset-0 bg-black/70 flex items-center justify-center">
                      <div className="bg-gray-900 text-white p-6 rounded space-y-3 w-full max-w-sm">
                        <h3 className="font-semibold">Bewerk uren</h3>
                        <div className="space-y-2">
                          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="w-full rounded bg-gray-800 border-gray-700 text-white p-2" />
                          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full rounded bg-gray-800 border-gray-700 text-white p-2" />
                          {isAdmin ? (
                            <>
                              <select
                                value={clientId}
                                onChange={(e) => {
                                  const nextId = e.target.value
                                  setClientId(nextId)
                                  const row = clientsById.get(nextId)
                                  if (row) setClientText(row.name)
                                }}
                                className="w-full rounded bg-gray-800 border border-gray-700 text-white p-2"
                              >
                                <option value="">Selecteer opdrachtgever…</option>
                                {clients.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>

                              <div className="text-xs text-gray-400">Of typ een nieuwe / andere opdrachtgever:</div>
                              <input
                                list="client-list"
                                placeholder="Klant"
                                value={clientText}
                                onChange={(e) => {
                                  setClientText(e.target.value)
                                  setClientId('')
                                }}
                                className="w-full rounded bg-gray-800 border border-gray-700 text-white p-2"
                              />
                            </>
                          ) : (
                            <>
                              {editing?.client && !isKnownClientName(editing.client) && (
                                <div className="text-xs text-gray-300">
                                  Huidige opdrachtgever: <span className="font-semibold">{editing.client}</span> (nog niet in lijst). Je kunt optioneel een bestaande kiezen.
                                </div>
                              )}
                            <select
                                value={clientId}
                                onChange={(e) => setClientId(e.target.value)}
                              className="w-full rounded bg-gray-800 border border-gray-700 text-white p-2"
                            >
                              <option value="">Selecteer opdrachtgever…</option>
                                {clients.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                              ))}
                            </select>
                            </>
                          )}
                          <input placeholder="Locatie" value={location} onChange={(e) => setLocation(e.target.value)} className="w-full rounded bg-gray-800 border-gray-700 text-white p-2" />
                          <div className="flex gap-2">
                            <input type="number" placeholder="Kilometers" value={editKilometers === '' ? '' : editKilometers} onChange={(e) => setEditKilometers(e.target.value === '' ? '' : Number(e.target.value))} className="w-1/2 rounded bg-gray-800 border-gray-700 text-white p-2" />
                            <button
                              type="button"
                              onClick={() => calculateKm('edit')}
                              disabled={kmLoading === 'edit'}
                              className="px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-white text-sm"
                            >
                              {kmLoading === 'edit' ? 'Berekenen…' : 'Kilometers berekenen'}
                            </button>
                            <label className="flex items-center gap-2">
                              <input type="checkbox" checked={editParkingPaid} onChange={(e) => setEditParkingPaid(e.target.checked)} />
                              Parkeren
                            </label>
                          </div>

                          <label className="flex items-center gap-2 text-sm text-gray-200">
                            <input
                              type="checkbox"
                              checked={editRoundTrip}
                              onChange={(e) => setEditRoundTrip(e.target.checked)}
                            />
                            Heen &amp; terug (×2)
                          </label>
                          {editParkingPaid && (
                            <input type="number" placeholder="Parkeerkosten" value={editParkingCost === '' ? '' : editParkingCost} onChange={(e) => setEditParkingCost(e.target.value === '' ? '' : Number(e.target.value))} className="w-full rounded bg-gray-800 border-gray-700 text-white p-2" />
                          )}

                          {kmInfoEdit && (
                            <div className="text-xs text-yellow-200">{kmInfoEdit}</div>
                          )}

                          {editError && (
                            <div className="text-sm text-red-300">{editError}</div>
                          )}
                        </div>
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setEditing(null)} className="px-3 py-1">Annuleren</button>
                          <button onClick={saveEdit} className="px-3 py-1 bg-black text-white rounded">Opslaan</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {manual && (
                    <div className="fixed inset-0 bg-black/70 flex items-center justify-center">
                      <div className="bg-gray-900 text-white p-6 rounded space-y-3 w-full max-w-sm">
                        <h3 className="font-semibold">Nieuwe entry van agenda</h3>
                        <div className="space-y-2">
                          <input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} className="w-full rounded bg-gray-800 border-gray-700 text-white p-2" />
                          <input type="time" value={manualStart} onChange={(e) => setManualStart(e.target.value)} className="w-full rounded bg-gray-800 border-gray-700 text-white p-2" />
                          <input type="time" value={manualEnd} onChange={(e) => setManualEnd(e.target.value)} className="w-full rounded bg-gray-800 border-gray-700 text-white p-2" />
                          {isAdmin ? (
                            <>
                              <select
                                value={clientId}
                                onChange={(e) => {
                                  const nextId = e.target.value
                                  setClientId(nextId)
                                  const row = clientsById.get(nextId)
                                  if (row) setClientText(row.name)
                                }}
                                className="w-full rounded bg-gray-800 border border-gray-700 text-white p-2"
                              >
                                <option value="">Selecteer opdrachtgever…</option>
                                {clients.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>

                              <div className="text-xs text-gray-400">Of typ een nieuwe / andere opdrachtgever:</div>
                              <input
                                list="client-list"
                                placeholder="Klant"
                                value={clientText}
                                onChange={(e) => {
                                  setClientText(e.target.value)
                                  setClientId('')
                                }}
                                className="w-full rounded bg-gray-800 border border-gray-700 text-white p-2"
                              />
                            </>
                          ) : (
                            <select
                              value={clientId}
                              onChange={(e) => setClientId(e.target.value)}
                              className="w-full rounded bg-gray-800 border border-gray-700 text-white p-2"
                            >
                              <option value="">Selecteer opdrachtgever…</option>
                              {clients.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          )}
                          <input placeholder="Locatie" value={location} onChange={(e) => setLocation(e.target.value)} className="w-full rounded bg-gray-800 border-gray-700 text-white p-2" />
                          <div className="flex gap-2">
                            <input type="number" placeholder="Kilometers" value={manualKilometers === '' ? '' : manualKilometers} onChange={(e) => setManualKilometers(e.target.value === '' ? '' : Number(e.target.value))} className="w-1/2 rounded bg-gray-800 border-gray-700 text-white p-2" />
                            <button
                              type="button"
                              onClick={() => calculateKm('manual')}
                              disabled={kmLoading === 'manual'}
                              className="px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-white text-sm"
                            >
                              {kmLoading === 'manual' ? 'Berekenen…' : 'Kilometers berekenen'}
                            </button>
                            <label className="flex items-center gap-2 text-white">
                              <input type="checkbox" checked={manualParkingPaid} onChange={(e) => setManualParkingPaid(e.target.checked)} />
                              Parkeren
                            </label>
                          </div>

                          <label className="flex items-center gap-2 text-sm text-gray-200">
                            <input
                              type="checkbox"
                              checked={manualRoundTrip}
                              onChange={(e) => setManualRoundTrip(e.target.checked)}
                            />
                            Heen &amp; terug (×2)
                          </label>
                          {manualParkingPaid && (
                            <input type="number" placeholder="Parkeerkosten" value={manualParkingCost === '' ? '' : manualParkingCost} onChange={(e) => setManualParkingCost(e.target.value === '' ? '' : Number(e.target.value))} className="w-full rounded bg-gray-800 border-gray-700 text-white p-2" />
                          )}

                          {kmInfoManual && (
                            <div className="text-xs text-yellow-200">{kmInfoManual}</div>
                          )}

                          {manualError && (
                            <div className="text-sm text-red-300">{manualError}</div>
                          )}
                        </div>
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setManual(false)} className="px-3 py-1">Annuleren</button>
                          <button onClick={saveManual} className="px-3 py-1 bg-black text-white rounded">Opslaan</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* KLUS INFO */}
                <div className="text-xs text-gray-400 flex flex-wrap gap-2">
                  {displayClientName(e) && <span>👤 {displayClientName(e)}</span>}
                  {e.location && <span>📍 {e.location}</span>}
                  {e.kilometers && (
                    <span>🚗 {e.kilometers} km</span>
                  )}
                  {e.parking_paid && (
                    <span>
                      🅿️ €{e.parking_cost ?? 0}
                    </span>
                  )}
                </div>

                {/* STATUS */}
                <div className="text-xs">
                  {e.approved === true && (
                    <span className="text-green-500">
                      ✅ Goedgekeurd
                    </span>
                  )}
                  {e.approved === false && (
                    <span className="text-yellow-500">
                      ⏳ Wacht op goedkeuring
                    </span>
                  )}
                  {e.manual ? (
                    <span className="text-orange-400 ml-2">Handmatig ingevoerd</span>
                  ) : (
                    <span className="text-orange-400 ml-2">Start/Stop knop</span>
                  )}
                  {!e.manual && needsDetails(e) && (
                    <span className="text-gray-400 ml-2">✏️ Data invullen</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
