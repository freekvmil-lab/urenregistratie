'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AddHoursModal from '@/components/ManualHoursEntry'

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
  break_minutes?: number | null
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

const toLocalISOStartEnd = (date: string, startTime: string, endTime: string) => {
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  const start = new Date(date)
  start.setHours(sh, sm, 0, 0)
  const end = new Date(date)
  end.setHours(eh, em, 0, 0)
  if (end.getTime() < start.getTime()) end.setDate(end.getDate() + 1)
  return { start: start.toISOString(), end: end.toISOString() }
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

const hours = (s: string, e: string | null) => {
  if (!e) return 0
  const diffMs = new Date(e).getTime() - new Date(s).getTime()
  if (!Number.isFinite(diffMs)) return 0
  if (diffMs < 0) {
    const corrected = diffMs + 24 * 3600000
    if (corrected > 0) return corrected / 3600000
  }
  return diffMs / 3600000
}

const sameStartEnd = (e: { start_time: string; end_time: string | null }) => {
  if (!e?.end_time) return false
  const s = new Date(e.start_time).getTime()
  const en = new Date(e.end_time).getTime()
  return Number.isFinite(s) && Number.isFinite(en) && s === en
}

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
  const [canManageOthers, setCanManageOthers] = useState(false)
  const [homeAddress, setHomeAddress] = useState<string>('')
  const [breakEnabled, setBreakEnabled] = useState(false)
  const [defaultBreakMinutes, setDefaultBreakMinutes] = useState(0)
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
  const [showAddHoursModal, setShowAddHoursModal] = useState(false)
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
  const [editBreakMinutes, setEditBreakMinutes] = useState(0)
  const [manualKilometers, setManualKilometers] = useState<number | ''>('')
  const [manualRoundTrip, setManualRoundTrip] = useState(true)
  const [manualParkingPaid, setManualParkingPaid] = useState(false)
  const [manualParkingCost, setManualParkingCost] = useState<number | ''>('')
  const [manualBreakMinutes, setManualBreakMinutes] = useState(0)

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
        const resAll = await supabase
          .from('clients')
          .select('id, name')
          .order('name', { ascending: true })
        data = resAll.data as any[] | null
        error = resAll.error
      }
    } else {
      const resAll = await supabase
        .from('clients')
        .select('id, name')
        .order('name', { ascending: true })
      data = resAll.data as any[] | null
      error = resAll.error

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

    let profile: any = null
    let error: any = null

    const res = await supabase
      .from('profiles')
      .select('role, home_address, break_enabled, default_break_minutes')
      .eq('id', user.id)
      .single()

    profile = res.data
    error = res.error

    if (error) {
      const res2 = await supabase
        .from('profiles')
        .select('role, home_address')
        .eq('id', user.id)
        .single()
      profile = res2.data
      error = res2.error
    }

    const role = String(profile?.role ?? '')
    setIsAdmin(role === 'admin')
    setCanManageOthers(role === 'admin' || role === 'sub-contractor')
    setHomeAddress(String(profile?.home_address ?? '').trim())
    setBreakEnabled(Boolean(profile?.break_enabled))
    setDefaultBreakMinutes(Math.max(0, Number(profile?.default_break_minutes ?? 0) || 0))
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
    setEditBreakMinutes(
      Math.max(
        0,
        Number(e.break_minutes ?? (breakEnabled ? defaultBreakMinutes : 0)) || 0
      )
    )
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

    const { start: startIso, end: endIso } = toLocalISOStartEnd(editing.date, start, end)

    const payload: any = {
      start_time: startIso,
      end_time: endIso,
      location: location || null,
      kilometers: editKilometers || null,
      parking_paid: editParkingPaid,
      parking_cost: editParkingPaid ? editParkingCost : null,
      break_minutes: breakEnabled ? Math.max(0, Math.round(editBreakMinutes)) : 0,
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

  const deleteEntry = async () => {
    if (!editing) return
    if (editing.approved === true) {
      setEditError('Deze entry is al goedgekeurd en kan niet meer worden verwijderd.')
      return
    }

    const ok = confirm('Weet je zeker dat je deze entry wilt verwijderen?')
    if (!ok) return

    setEditError(null)

    const { error } = await supabase
      .from('time_entries')
      .delete()
      .eq('id', editing.id)

    if (error) {
      setEditError(error.message || 'Verwijderen mislukt')
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

    const { start: manualStartIso, end: manualEndIso } = toLocalISOStartEnd(manualDate, manualStart, manualEnd)

    const manualPayload: any = {
      user_id: userId,
      date: manualDate,
      start_time: manualStartIso,
      end_time: manualEndIso,
      manual: true,
      edited: true,
      approved: false,
      location: location || null,
      kilometers: manualKilometers || null,
      parking_paid: manualParkingPaid,
      parking_cost: manualParkingPaid ? manualParkingCost : null,
      break_minutes: breakEnabled ? Math.max(0, Math.round(manualBreakMinutes)) : 0,
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
      setManualBreakMinutes(breakEnabled ? defaultBreakMinutes : 0)
      setManual(true)
    }

    window.addEventListener('openManual', handler as EventListener)
    return () => window.removeEventListener('openManual', handler as EventListener)
  }, [breakEnabled, defaultBreakMinutes])

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
        setManualBreakMinutes(breakEnabled ? defaultBreakMinutes : 0)
        setManual(true)
        return
      }

      setManual(true)
      setManualError(null)
      setManualRoundTrip(true)
      const s = new Date(startIso)
      const en = new Date(endIso)

      setManualDate(toLocalYmd(s))
      setManualBreakMinutes(breakEnabled ? defaultBreakMinutes : 0)
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
  }, [clients, breakEnabled, defaultBreakMinutes])

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

  const defaultManualDateForWeek = (() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (today >= weekStart && today <= weekEnd) return toLocalYmd(today)
    return toLocalYmd(weekStart)
  })()

  const grouped = weekEntries.reduce<Record<string, Entry[]>>(
    (acc, e) => {
      acc[e.date] = acc[e.date] || []
      acc[e.date].push(e)
      return acc
    },
    {}
  )

  const weekTotal = weekEntries.reduce(
    (s, e) => {
      const br = Math.max(0, Number(e.break_minutes ?? 0) || 0) / 60
      return s + Math.max(0, hours(e.start_time, e.end_time) - br)
    },
    0
  )

  const getIsoWeekNumber = (date: Date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    const day = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - day)
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  }

  const isoWeekNumber = getIsoWeekNumber(weekStart)

  /* =======================
     RENDER
  ======================= */

  return (
    <div className="mt-6 space-y-6 text-gray-900 dark:text-gray-100">
      {/* HEADER */}
      <div className="flex justify-between items-center gap-4">
        <button
          onClick={() =>
            setCurrentWeek(
              new Date(currentWeek.setDate(currentWeek.getDate() - 7))
            )
          }
          className="px-2 py-1 rounded border border-orange-200/70 hover:border-orange-300 hover:bg-orange-50 dark:border-orange-500/30 dark:hover:bg-orange-500/10"
        >
          ← Vorige
        </button>

        <strong className="text-base sm:text-lg font-extrabold text-gray-900 dark:text-gray-100">
          Week {isoWeekNumber}
        </strong>

        <button
          onClick={() => {
            const ev = new CustomEvent('openManual', {
              detail: { date: defaultManualDateForWeek },
            })
            window.dispatchEvent(ev)
          }}
          className="px-3 py-1 rounded border border-orange-200/70 hover:border-orange-300 hover:bg-orange-50 dark:border-orange-500/30 dark:hover:bg-orange-500/10 text-sm font-medium"
        >
          + Uren Toevoegen
        </button>

        {canManageOthers && (
          <button
            onClick={() => setShowAddHoursModal(true)}
            className="px-3 py-1 rounded border border-blue-200/70 hover:border-blue-300 hover:bg-blue-50 dark:border-blue-500/30 dark:hover:bg-blue-500/10 text-sm font-medium"
          >
            ➕👷 Uren toevoegen werknemer
          </button>
        )}

        <button
          onClick={() =>
            setCurrentWeek(
              new Date(currentWeek.setDate(currentWeek.getDate() + 7))
            )
          }
          className="px-2 py-1 rounded border border-orange-200/70 hover:border-orange-300 hover:bg-orange-50 dark:border-orange-500/30 dark:hover:bg-orange-500/10"
        >
          Volgende →
        </button>
      </div>

      <p className="font-bold text-gray-900 dark:text-gray-100">
      </p>

      <datalist id="client-list">
        {clients.map((c) => (
          <option key={c.id} value={c.name} />
        ))}
      </datalist>

      {weekEntries.length === 0 && (
        <div className="py-10">
          <div className="mx-auto max-w-xl rounded-xl border border-orange-200/60 dark:border-orange-500/30 bg-white/70 dark:bg-gray-900/40 p-6 text-center">
            <div className="text-lg font-extrabold text-gray-900 dark:text-gray-100">
              Wat jammer dat je nog niet hebt gewerkt…
            </div>
            <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              Voeg snel je uren toe, klik op agenda ophalen om je geplande diensten te zien.
            </div>
            <div className="mt-4 flex justify-center gap-2">
              <button
                onClick={() => {
                  const ev = new CustomEvent('openManual', {
                    detail: { date: defaultManualDateForWeek },
                  })
                  window.dispatchEvent(ev)
                }}
                className="border border-orange-500/60 hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10 px-4 py-2 rounded"
              >
                ➕ Uren toevoegen
              </button>
              {canManageOthers && (
                <button
                  onClick={() => setShowAddHoursModal(true)}
                  className="border border-blue-500/60 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 px-4 py-2 rounded"
                >
                  ➕👷 Uren toevoegen werknemer
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DAYS (Mon -> Sun) */}
      {Object.entries(grouped)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, list]) => {
          const dayTotal = list.reduce((s, e) => {
            const br = Math.max(0, Number(e.break_minutes ?? 0) || 0) / 60
            return s + Math.max(0, hours(e.start_time, e.end_time) - br)
          }, 0)

          const dayBreakMinutes = list.reduce(
            (s, e) => s + Math.max(0, Number(e.break_minutes ?? 0) || 0),
            0
          )
          const hasEdited = list.some((e) => Boolean(e.edited))
          const editedEntries = list.filter((e) => Boolean(e.edited))
          const allEditedApproved =
            editedEntries.length > 0 && editedEntries.every((e) => e.approved === true)
          const anyEditedPending = editedEntries.some((e) => e.approved !== true)

          return (
            <div
              key={date}
              className="bg-white border border-orange-200/60 rounded-lg p-4 space-y-3 dark:bg-black/30 dark:border-orange-500/25"
            >
              <div className="flex items-start justify-between gap-3 font-medium text-gray-900 dark:text-gray-100">
                <div className="flex flex-wrap items-center gap-2">
                  <span>{formatDate(date)}</span>

                  {hasEdited && anyEditedPending && !allEditedApproved && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-yellow-200 bg-yellow-50 px-2 py-0.5 text-xs font-semibold text-yellow-800 dark:border-yellow-500/25 dark:bg-yellow-500/10 dark:text-yellow-200">
                      <span aria-hidden>⏳</span>
                      Uren zijn ingevuld – wacht op goedkeuring
                    </span>
                  )}

                  {hasEdited && allEditedApproved && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-800 dark:border-green-500/25 dark:bg-green-500/10 dark:text-green-200">
                      <span aria-hidden>✅</span>
                      Uren zijn goedgekeurd
                    </span>
                  )}

                  {dayBreakMinutes > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-200">
                      <span aria-hidden>☕</span>
                      Pauze: {(dayBreakMinutes / 60).toLocaleString('nl-NL', { maximumFractionDigits: 2 })} uur
                    </span>
                  )}
                </div>
                <span>{dayTotal.toFixed(2)} uur</span>
              </div>

              {/* inline start/stop is rendered in TimeTracker; no duplicate here */}

              {list.map((e) => (
                <div
                  key={e.id}
                  className="border-t border-orange-200/50 pt-2 space-y-1 text-sm text-gray-900 dark:border-orange-500/20 dark:text-gray-100"
                >
                  <div className="flex justify-between">
                    <span>
                      {formatTime(e.start_time)} – {formatTime(e.end_time)}
                    </span>

                    {e.approved !== true && (
                      <button
                        onClick={() => openEdit(e)}
                        className="text-orange-500"
                      >
                        ✏️
                      </button>
                    )}
                  </div>

                  {sameStartEnd(e) && (
                    <div className="text-xs">
                      <span className="inline-flex items-center rounded-full border border-red-300 bg-red-50 px-2 py-0.5 font-semibold text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                        Let op!! Begin tijd en eind tijd zijn hetzelfde
                      </span>
                    </div>
                  )}

                  {/* KLUS INFO */}
                  <div className="text-xs text-gray-800 dark:text-gray-300 flex flex-wrap gap-2">
                    {displayClientName(e) && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 font-semibold text-orange-900 dark:border-orange-500/25 dark:bg-orange-500/10 dark:text-orange-100">
                        <span aria-hidden>👤</span>
                        {displayClientName(e)}
                      </span>
                    )}

                    {e.location && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-gray-800 dark:border-white/10 dark:bg-white/5 dark:text-gray-200">
                        <span aria-hidden>📍</span>
                        {e.location}
                      </span>
                    )}

                    {(e.kilometers !== null && e.kilometers !== undefined) && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-gray-800 dark:border-white/10 dark:bg-white/5 dark:text-gray-200">
                        <span aria-hidden>🚗</span>
                        {Number(e.kilometers).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} km
                      </span>
                    )}

                    {e.parking_paid && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-gray-800 dark:border-white/10 dark:bg-white/5 dark:text-gray-200">
                        <span aria-hidden>🅿️</span>
                        {e.parking_cost !== null && e.parking_cost !== undefined
                          ? `€${Number(e.parking_cost).toLocaleString('nl-NL', { maximumFractionDigits: 2 })}`
                          : 'Parkeren'}
                      </span>
                    )}
                  </div>

                  {!e.manual && needsDetails(e) && (
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      ✏️ Data invullen
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        })}

      <div className="flex justify-end">
        <div className="inline-flex items-center gap-2 rounded-lg border border-orange-200/60 dark:border-orange-500/30 bg-white/60 dark:bg-gray-900/40 px-4 py-2">
          <span className="text-sm text-gray-700 dark:text-gray-200">Totaal uren</span>
          <span className="font-mono font-semibold text-gray-900 dark:text-gray-100">
            {weekTotal.toFixed(2)}
          </span>
        </div>
      </div>

      {/* MODALS (rendered once so they also work on empty weeks) */}
      {editing && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center">
          <div className="bg-gray-900 text-white p-6 rounded space-y-3 w-full max-w-sm">
            <h3 className="font-semibold">Bewerk uren</h3>
            <div className="space-y-2">
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="w-full rounded bg-gray-800 border-gray-700 text-white p-2" />
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full rounded bg-gray-800 border-gray-700 text-white p-2" />
              {breakEnabled && (
                <div>
                  <div className="text-xs text-gray-300 mb-1">Pauze (uur)</div>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.25"
                    min="0"
                    value={String((editBreakMinutes ?? 0) / 60)}
                    onChange={(e) => {
                      const h = e.target.value === '' ? 0 : Number(e.target.value)
                      const minutes = Number.isFinite(h) ? Math.max(0, Math.round(h * 60)) : 0
                      setEditBreakMinutes(minutes)
                    }}
                    className="w-full rounded bg-gray-800 border-gray-700 text-white p-2"
                  />
                </div>
              )}
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
              {editing.approved !== true && (
                <button
                  onClick={deleteEntry}
                  className="px-3 py-1 rounded border border-red-500/60 text-red-200 hover:bg-red-500/10"
                >
                  Verwijder
                </button>
              )}
              <button onClick={saveEdit} className="px-3 py-1 bg-black text-white rounded">Opslaan</button>
            </div>
          </div>
        </div>
      )}

      {manual && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center">
          <div className="bg-gray-900 text-white p-6 rounded space-y-3 w-full max-w-sm">
            <h3 className="font-semibold">Nieuwe entry</h3>
            <div className="space-y-2">
              <input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} className="w-full rounded bg-gray-800 border-gray-700 text-white p-2" />
              <input type="time" value={manualStart} onChange={(e) => setManualStart(e.target.value)} className="w-full rounded bg-gray-800 border-gray-700 text-white p-2" />
              <input type="time" value={manualEnd} onChange={(e) => setManualEnd(e.target.value)} className="w-full rounded bg-gray-800 border-gray-700 text-white p-2" />
              {breakEnabled && (
                <div>
                  <div className="text-xs text-gray-300 mb-1">Pauze (uur)</div>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.25"
                    min="0"
                    value={String((manualBreakMinutes ?? 0) / 60)}
                    onChange={(e) => {
                      const h = e.target.value === '' ? 0 : Number(e.target.value)
                      const minutes = Number.isFinite(h) ? Math.max(0, Math.round(h * 60)) : 0
                      setManualBreakMinutes(minutes)
                    }}
                    className="w-full rounded bg-gray-800 border-gray-700 text-white p-2"
                  />
                </div>
              )}
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

      <AddHoursModal
        isOpen={showAddHoursModal}
        onClose={() => setShowAddHoursModal(false)}
        onSuccess={() => {
          fetchEntries()
        }}
      />
    </div>
  )
}
