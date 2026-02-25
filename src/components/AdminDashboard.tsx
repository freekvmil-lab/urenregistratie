'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import UserManagement from '@/components/UserManagement'

interface TimeEntry {
  id: number
  user_id: string
  date: string
  start_time: string | null
  end_time: string | null
  manual?: boolean | null
  name: string
  edited?: boolean
  approved?: boolean
  client?: string | null
  client_id?: string | null
  location?: string | null
  kilometers?: number | null
  parking_paid?: boolean | null
  parking_cost?: number | null
  break_minutes?: number | null
  approved_at?: string | null
  approved_by?: string | null
}

interface Profile {
  id: string
  name: string | null
}

interface ClientRow {
  id: string
  name: string
}

type StatusFilter = 'all' | 'pending' | 'approved' | 'needs_details'
type ViewMode = 'list' | 'week'

const toLocalYmd = (d: Date) => {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const parseYmdToLocalDate = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const addDays = (d: Date, days: number) => {
  const next = new Date(d)
  next.setDate(next.getDate() + days)
  return next
}

// ISO week/year (week starts Monday)
const getIsoWeek = (dateInput: Date) => {
  const d = new Date(dateInput)
  d.setHours(0, 0, 0, 0)
  // Thursday in current week decides the year.
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  const week =
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) /
        7
    )
  return { week, year: d.getFullYear() }
}

const startOfIsoWeek = (dateInput: Date) => {
  const d = new Date(dateInput)
  d.setHours(0, 0, 0, 0)
  const day = (d.getDay() + 6) % 7 // Mon=0 ... Sun=6
  d.setDate(d.getDate() - day)
  return d
}

const isoWeekValueFromYmd = (ymd: string) => {
  const d = parseYmdToLocalDate(ymd)
  const iso = getIsoWeek(d)
  return `${iso.year}-W${String(iso.week).padStart(2, '0')}`
}

const ymdFromIsoWeekValue = (weekValue: string) => {
  // weekValue: YYYY-Www
  const m = /^([0-9]{4})-W([0-9]{2})$/.exec(String(weekValue).trim())
  if (!m) return toLocalYmd(startOfIsoWeek(new Date()))
  const year = Number(m[1])
  const week = Number(m[2])
  if (!year || !week) return toLocalYmd(startOfIsoWeek(new Date()))

  // ISO week 1 is the week with Jan 4th
  const jan4 = new Date(year, 0, 4)
  const week1Monday = startOfIsoWeek(jan4)
  const monday = addDays(week1Monday, (week - 1) * 7)
  return toLocalYmd(monday)
}

const hoursBetween = (start: string | null, end: string | null) => {
  if (!start || !end) return 0
  const diffMs = new Date(end).getTime() - new Date(start).getTime()
  if (!Number.isFinite(diffMs)) return 0
  if (diffMs < 0) {
    const corrected = diffMs + 24 * 3600000
    if (corrected > 0) return corrected / 3600000
  }
  return diffMs / 3600000
}

const toTimeInput = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
    : ''

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

const formatHours = (h: number) => (Math.round(h * 100) / 100).toFixed(2)

const needsDetails = (e: TimeEntry) => {
  if (e.manual) return false
  if (!e.end_time) return false
  const hasClient = Boolean((e.client_id && String(e.client_id).trim()) || (e.client && String(e.client).trim()))
  const hasLocation = Boolean(e.location && String(e.location).trim())
  const parkingOk = !e.parking_paid || e.parking_cost !== null && e.parking_cost !== undefined
  return !hasClient || !hasLocation || !parkingOk
}

function KpiCard({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div className="border border-orange-200/60 dark:border-orange-500/30 rounded-lg p-4 bg-white/60 dark:bg-gray-900/40">
      <div className="text-xs text-gray-600 dark:text-gray-300">{title}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{sub}</div>}
    </div>
  )
}

export default function AdminDashboard() {
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [users, setUsers] = useState<Profile[]>([])
  const [clients, setClients] = useState<ClientRow[]>([])
  const [selectedUser, setSelectedUser] = useState<string>('all')
  const [loading, setLoading] = useState(true)

  const [editing, setEditing] = useState<TimeEntry | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [editClientId, setEditClientId] = useState<string>('')
  const [editLocation, setEditLocation] = useState('')
  const [editKilometers, setEditKilometers] = useState<number | ''>('')
  const [editParkingPaid, setEditParkingPaid] = useState(false)
  const [editParkingCost, setEditParkingCost] = useState<number | ''>('')
  const [editBreakMinutes, setEditBreakMinutes] = useState(0)
  const [editBusy, setEditBusy] = useState(false)

  const [exportClientOpen, setExportClientOpen] = useState(false)
  const [exportClientId, setExportClientId] = useState<string>('')
  const [exportWeekStart, setExportWeekStart] = useState<string>(() =>
    toLocalYmd(startOfIsoWeek(new Date()))
  )
  const [exportWeekValue, setExportWeekValue] = useState<string>(() =>
    isoWeekValueFromYmd(toLocalYmd(startOfIsoWeek(new Date())))
  )

  const [viewMode, setViewMode] = useState<ViewMode>('week')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')

  // Week view: keep the selected week stable (Monday)
  const [selectedWeekStart, setSelectedWeekStart] = useState(() =>
    toLocalYmd(startOfIsoWeek(new Date()))
  )

  // Default: last 8 weeks
  const [from, setFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7 * 8)
    return toLocalYmd(d)
  })
  const [to, setTo] = useState(() => toLocalYmd(new Date()))

  /* =======================
     FETCH USERS
  ======================= */

  const fetchUsers = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, name')
      .order('name')

    if (data) setUsers(data)
  }

  /* =======================
     FETCH ENTRIES
  ======================= */

  const fetchEntries = async () => {
    setLoading(true)

    const { data: entriesData, error } = await supabase
      .from('time_entries')
      .select(
        'id, user_id, date, start_time, end_time, manual, edited, approved, client, client_id, location, kilometers, parking_paid, parking_cost, break_minutes, approved_at, approved_by'
      )
      .order('date', { ascending: false })

    if (error || !entriesData) {
      console.error('fetchEntries error:', error)
      setEntries([])
      setLoading(false)
      return
    }

    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, name')

    const profileMap = new Map(
      (profilesData ?? []).map((p) => [p.id, p.name])
    )

    const mapped: TimeEntry[] = entriesData.map((e) => ({
      ...e,
      name: profileMap.get(e.user_id) ?? 'Onbekend',
    }))

    setEntries(mapped)
    setLoading(false)
  }

  const fetchClients = async () => {
    const { data, error } = await supabase
      .from('clients')
      .select('id, name')
      .order('name', { ascending: true })

    if (error) {
      setClients([])
      return
    }
    const rows = (data ?? []) as any[]
    setClients(
      rows
        .map((r) => ({ id: String(r.id), name: String(r.name) }))
        .filter((r) => r.id && r.name)
    )
  }

  useEffect(() => {
    fetchUsers()
    fetchEntries()
    fetchClients()
  }, [])

  const openEdit = (e: TimeEntry) => {
    setEditError(null)
    setEditing(e)
    setEditStart(toTimeInput(e.start_time))
    setEditEnd(toTimeInput(e.end_time))
    setEditClientId(String(e.client_id ?? '') || '')
    setEditLocation(String(e.location ?? '') || '')
    setEditKilometers(e.kilometers ?? '')
    setEditParkingPaid(Boolean(e.parking_paid))
    setEditParkingCost(e.parking_cost ?? '')
    setEditBreakMinutes(Math.max(0, Number(e.break_minutes ?? 0) || 0))
  }

  const saveEdit = async () => {
    if (!editing) return
    if (editing.approved) {
      setEditError('Deze entry is al goedgekeurd en kan niet meer worden gewijzigd.')
      return
    }

    if (!editStart || !editEnd) {
      setEditError('Vul start en stop tijd in')
      return
    }

    setEditBusy(true)
    setEditError(null)
    try {
      const { start, end } = toLocalISOStartEnd(editing.date, editStart, editEnd)

      const payload: any = {
        start_time: start,
        end_time: end,
        client_id: editClientId ? editClientId : null,
        location: editLocation || null,
        kilometers: editKilometers === '' ? null : editKilometers,
        parking_paid: Boolean(editParkingPaid),
        parking_cost: editParkingPaid ? (editParkingCost === '' ? null : editParkingCost) : null,
        break_minutes: Math.max(0, Math.round(Number(editBreakMinutes) || 0)),
        edited: true,
        approved: false,
        approved_at: null,
        approved_by: null,
      }

      // If client_id cleared, also clear legacy text client to prevent confusion
      if (!payload.client_id) payload.client = null

      const { error } = await supabase
        .from('time_entries')
        .update(payload)
        .eq('id', editing.id)

      if (error) {
        setEditError(error.message || 'Opslaan mislukt')
        return
      }

      setEditing(null)
      await fetchEntries()
    } finally {
      setEditBusy(false)
    }
  }

  /* =======================
     ACTIONS
  ======================= */

  const approveEntry = async (entryId: number) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const approvedAt = new Date().toISOString()

    const { error } = await supabase
      .from('time_entries')
      .update({
        approved: true,
        approved_at: approvedAt,
        approved_by: user.id,
      })
      .eq('id', entryId)

    if (error) {
      alert('Goedkeuren mislukt: ' + error.message)
      return
    }

    // Optimistic UI update (prevents jumping around)
    setEntries((prev) =>
      prev.map((e) =>
        e.id === entryId
          ? { ...e, approved: true, approved_at: approvedAt, approved_by: user.id }
          : e
      )
    )
  }

  const deleteEntry = async (entryId: number) => {
    const ok = confirm('Weet je zeker dat je deze uren wilt verwijderen?')
    if (!ok) return

    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        alert('Niet ingelogd')
        return
      }

      const { error } = await supabase
        .from('time_entries')
        .delete()
        .eq('id', entryId)

      if (error) {
        console.error('deleteEntry error:', error)
        alert('Verwijderen mislukt: ' + error.message)
      } else {
        // Optimistic update
        setEntries((prev) => prev.filter((e) => e.id !== entryId))
      }
    } catch (e) {
      console.error('deleteEntry crash', e)
      alert('Er ging iets mis bij verwijderen')
    } finally {
      setLoading(false)
    }
  }

  /* =======================
     HELPERS
  ======================= */

  const weekStartDate = parseYmdToLocalDate(selectedWeekStart)
  const weekEndDate = addDays(weekStartDate, 6)
  const weekEndYmd = toLocalYmd(weekEndDate)
  const weekIso = getIsoWeek(weekStartDate)

  const activeFrom = viewMode === 'week' ? selectedWeekStart : from
  const activeTo = viewMode === 'week' ? weekEndYmd : to

  const filteredEntries =
    entries
      .filter((e) => (selectedUser === 'all' ? true : e.user_id === selectedUser))
      .filter((e) => {
        if (!activeFrom && !activeTo) return true
        const d = e.date
        if (activeFrom && d < activeFrom) return false
        if (activeTo && d > activeTo) return false
        return true
      })
      .filter((e) => {
        if (statusFilter === 'all') return true
        if (statusFilter === 'approved') return Boolean(e.approved)
        if (statusFilter === 'pending') return Boolean(e.edited) && !e.approved
        if (statusFilter === 'needs_details') return needsDetails(e)
        return true
      })
      .filter((e) => {
        const q = search.trim().toLowerCase()
        if (!q) return true
        const hay = [
          e.name,
          e.user_id,
          e.date,
          e.client ?? '',
          e.location ?? '',
          e.client_id ?? '',
        ]
          .join(' ')
          .toLowerCase()
        return hay.includes(q)
      })
  
  const formatDate = (date: string) => new Date(date).toLocaleDateString('nl-NL')

  const formatTime = (date: string | null) => {
    if (!date) return ''
    return new Date(date).toLocaleTimeString('nl-NL', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const sameStartEnd = (e: { start_time: string | null; end_time: string | null }) => {
    if (!e?.start_time || !e?.end_time) return false
    const s = new Date(e.start_time).getTime()
    const en = new Date(e.end_time).getTime()
    return Number.isFinite(s) && Number.isFinite(en) && s === en
  }


  const calculateHours = (e: TimeEntry) => {
    const h = hoursBetween(e.start_time, e.end_time)
    const br = Math.max(0, Number(e.break_minutes ?? 0) || 0) / 60
    const net = Math.max(0, h - br)
    if (!net) return ''
    return formatHours(net)
  }

  const clientsById = new Map(clients.map((c) => [c.id, c.name]))
  const displayClient = (e: TimeEntry) => {
    if (e.client_id && clientsById.has(String(e.client_id))) return clientsById.get(String(e.client_id))!
    return e.client ?? ''
  }

  const entryHours = (e: TimeEntry) => {
    const h = hoursBetween(e.start_time, e.end_time)
    const br = Math.max(0, Number(e.break_minutes ?? 0) || 0) / 60
    return Math.max(0, h - br)
  }

  const totalHours = filteredEntries.reduce((sum, e) => sum + entryHours(e), 0)
  const approvedHours = filteredEntries
    .filter((e) => e.approved)
    .reduce((sum, e) => sum + entryHours(e), 0)
  const pendingCount = filteredEntries.filter((e) => e.edited && !e.approved).length
  const needsDetailsCount = filteredEntries.filter((e) => needsDetails(e)).length

  const approveAllPending = async () => {
    const ids = filteredEntries.filter((e) => e.edited && !e.approved).map((e) => e.id)
    if (!ids.length) return
    const ok = confirm(`Goedkeuren: ${ids.length} entries?`)
    if (!ok) return
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const approvedAt = new Date().toISOString()
      const { error } = await supabase
        .from('time_entries')
        .update({ approved: true, approved_at: approvedAt, approved_by: user.id })
        .in('id', ids)
      if (error) {
        alert('Goedkeuren mislukt: ' + error.message)
        return
      }

      setEntries((prev) =>
        prev.map((e) =>
          ids.includes(e.id) ? { ...e, approved: true, approved_at: approvedAt, approved_by: user.id } : e
        )
      )
    } finally {
      setLoading(false)
    }
  }

  const weekEntries = [...filteredEntries].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date)
    if (byDate !== 0) return byDate
    const aStart = a.start_time ?? ''
    const bStart = b.start_time ?? ''
    const byStart = aStart.localeCompare(bStart)
    if (byStart !== 0) return byStart
    return String(a.id).localeCompare(String(b.id))
  })

  const weekHours = weekEntries.reduce((sum, e) => sum + entryHours(e), 0)
  const weekPending = weekEntries.filter((e) => e.edited && !e.approved).length
  const weekMissingDetails = weekEntries.filter((e) => needsDetails(e)).length

  const topUsers = (() => {
    const byUser = new Map<string, number>()
    for (const e of weekEntries) {
      const h = entryHours(e)
      byUser.set(e.name, (byUser.get(e.name) ?? 0) + h)
    }
    return Array.from(byUser.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
  })()

  const topClients = (() => {
    const byClient = new Map<string, number>()
    for (const e of weekEntries) {
      const key = displayClient(e) || '—'
      const h = entryHours(e)
      byClient.set(key, (byClient.get(key) ?? 0) + h)
    }
    return Array.from(byClient.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
  })()

  const exportCSV = () => {
    const weekAll = entries.filter((e) => e.date >= selectedWeekStart && e.date <= weekEndYmd)

    if (!weekAll.length) {
      alert('Geen entries om te exporteren in deze week')
      return
    }

    const notApprovedCount = weekAll.filter((e) => e.approved !== true).length
    if (notApprovedCount > 0) {
      const ok = confirm(
        `Er zijn ${notApprovedCount} entry(s) nog niet goedgekeurd. Wil je alsnog exporteren?\n\nExport bevat alleen goedgekeurde uren.`
      )
      if (!ok) return
    }

    const approvedOnly = weekAll.filter((e) => e.approved === true)
    if (!approvedOnly.length) {
      alert('Geen goedgekeurde entries om te exporteren in deze week')
      return
    }

    const formatNumberNl = (n: number, maxFractionDigits = 2) =>
      (Number.isFinite(n) ? n : 0).toLocaleString('nl-NL', {
        maximumFractionDigits: maxFractionDigits,
      })

    const weekLabel = `Week ${weekIso.week}`

    type SummaryRow = {
      client: string
      employee: string
      hoursTotal: number
      kmTotal: number
      parkingTotal: number
      breakHoursTotal: number
    }

    const groups = new Map<string, SummaryRow>()
    for (const e of approvedOnly) {
      const clientName = String(displayClient(e) || 'Onbekend').trim() || 'Onbekend'
      const employeeName = e.name ?? 'Onbekend'
      const h = entryHours(e)
      const km = e.kilometers != null && Number.isFinite(e.kilometers) ? Number(e.kilometers) : 0
      const parking = e.parking_paid ? Math.max(0, Number(e.parking_cost ?? 0) || 0) : 0
      const br = Math.max(0, Number(e.break_minutes ?? 0) || 0) / 60

      const key = `${clientName}|${employeeName}`
      const existing = groups.get(key)
      if (!existing) {
        groups.set(key, {
          client: clientName,
          employee: employeeName,
          hoursTotal: h,
          kmTotal: km,
          parkingTotal: parking,
          breakHoursTotal: br,
        })
      } else {
        existing.hoursTotal += h
        existing.kmTotal += km
        existing.parkingTotal += parking
        existing.breakHoursTotal += br
      }
    }

    const summary = Array.from(groups.values()).sort((a, b) => {
      const byClient = a.client.localeCompare(b.client)
      if (byClient !== 0) return byClient
      return a.employee.localeCompare(b.employee)
    })

    const header = ['Week', 'Opdrachtgever', 'Werknemer', 'Uren totaal', 'KM', 'Parkeren', 'Pauze']
    const rows = summary.map((r, idx) => [
      idx === 0 ? weekLabel : '',
      r.client,
      r.employee,
      formatNumberNl(r.hoursTotal, 2),
      formatNumberNl(r.kmTotal, 1),
      formatNumberNl(r.parkingTotal, 2),
      formatNumberNl(r.breakHoursTotal, 2),
    ])

    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `week-${weekIso.week}-export.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportClientCSV = () => {
    if (!exportClientId) {
      alert('Selecteer een opdrachtgever')
      return
    }

    const weekStart = exportWeekStart
    const weekStartDate = parseYmdToLocalDate(weekStart)
    const weekEndDate = addDays(weekStartDate, 6)
    const weekEnd = toLocalYmd(weekEndDate)
    const weekIsoLocal = getIsoWeek(weekStartDate)

    const clientName = clientsById.get(String(exportClientId)) ?? ''

    const weekAll = entries.filter((e) => e.date >= weekStart && e.date <= weekEnd)
    const weekClientAll = weekAll.filter((e) => {
      if (String(e.client_id ?? '') === String(exportClientId)) return true
      if (clientName && String(e.client ?? '') === clientName) return true
      return false
    })

    if (!weekClientAll.length) {
      alert('Geen entries gevonden voor deze opdrachtgever in deze week')
      return
    }

    const notApprovedCount = weekClientAll.filter((e) => e.approved !== true).length
    if (notApprovedCount > 0) {
      const ok = confirm(
        `Er zijn ${notApprovedCount} entry(s) nog niet goedgekeurd. Wil je alsnog exporteren?\n\nExport bevat alleen goedgekeurde uren.`
      )
      if (!ok) return
    }

    const approvedOnly = weekClientAll.filter((e) => e.approved === true)
    if (!approvedOnly.length) {
      alert('Geen goedgekeurde entries om te exporteren voor deze opdrachtgever in deze week')
      return
    }

    const formatNumberNl = (n: number, maxFractionDigits = 2) =>
      (Number.isFinite(n) ? n : 0).toLocaleString('nl-NL', {
        maximumFractionDigits: maxFractionDigits,
      })

    type DayRow = {
      date: string
      employee: string
      hoursTotal: number
      kmTotal: number
      parkingTotal: number
      breakHoursTotal: number
    }

    const groups = new Map<string, DayRow>()
    for (const e of approvedOnly) {
      const employee = e.name ?? 'Onbekend'
      const date = e.date
      const key = `${date}|${employee}`

      const h = entryHours(e)
      const brH = Math.max(0, Number(e.break_minutes ?? 0) || 0) / 60
      const km = e.kilometers != null && Number.isFinite(e.kilometers) ? Number(e.kilometers) : 0
      const parking = e.parking_paid ? Math.max(0, Number(e.parking_cost ?? 0) || 0) : 0

      const existing = groups.get(key)
      if (!existing) {
        groups.set(key, {
          date,
          employee,
          hoursTotal: h,
          kmTotal: km,
          parkingTotal: parking,
          breakHoursTotal: brH,
        })
      } else {
        existing.hoursTotal += h
        existing.kmTotal += km
        existing.parkingTotal += parking
        existing.breakHoursTotal += brH
      }
    }

    const anyBreaks = Array.from(groups.values()).some((r) => (r.breakHoursTotal ?? 0) > 0)

    const header = ['Week', 'Datum', 'Opdrachtgever', 'Werknemer', 'Uren totaal', 'KM', 'Parkeren']
    if (anyBreaks) header.push('Pauze')

    const rows = Array.from(groups.values())
      .sort((a, b) => {
        const byDate = a.date.localeCompare(b.date)
        if (byDate !== 0) return byDate
        return a.employee.localeCompare(b.employee)
      })
      .map((r) => [
        `Week ${weekIsoLocal.week}`,
        r.date,
        clientName || '—',
        r.employee,
        formatNumberNl(r.hoursTotal, 2),
        formatNumberNl(r.kmTotal, 1),
        formatNumberNl(r.parkingTotal, 2),
        ...(anyBreaks ? [formatNumberNl(r.breakHoursTotal, 2)] : []),
      ])

    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const safeClient = (clientName || 'opdrachtgever').replace(/[^a-z0-9]/gi, '_')
    a.download = `week-${weekIsoLocal.week}-${safeClient}-details.csv`
    a.click()
    URL.revokeObjectURL(url)

    setExportClientOpen(false)
  }

  const renderStatus = (e: TimeEntry) => {
    if (!e.edited) return <span className="text-gray-400">—</span>
    if (e.approved)
      return <span className="text-green-600">Goedgekeurd</span>
    return (
      <span className="text-orange-600">Wacht op goedkeuring</span>
    )
  }

  /* =======================
     RENDER
  ======================= */

  return (
    <div className="px-4 py-4 sm:p-6 space-y-8">
      <div>
        <div className="flex flex-wrap gap-3 items-center justify-between mb-4">
          <h1 className="text-xl sm:text-2xl font-bold">Admin Dashboard</h1>

          <div className="flex flex-wrap gap-2">
            <button onClick={approveAllPending} className="px-3 py-1 rounded bg-green-600 hover:bg-green-700 text-white">
              Alles goedkeuren
            </button>
            <button onClick={exportCSV} className="px-3 py-1 rounded bg-gray-800 text-white">
              Export CSV
            </button>
            <button
              onClick={() => {
                setExportWeekStart(selectedWeekStart)
                setExportWeekValue(isoWeekValueFromYmd(selectedWeekStart))
                setExportClientId('')
                setExportClientOpen(true)
              }}
              className="px-3 py-1 rounded bg-orange-600 hover:bg-orange-700 text-white"
            >
              Export CSV opdrachtgever
            </button>
          </div>
        </div>

        {viewMode === 'week' && (
          <div className="border border-orange-200/60 dark:border-orange-500/30 rounded-lg p-4 bg-white/60 dark:bg-gray-900/40 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  Week {weekIso.week}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-300">
                  {weekStartDate.toLocaleDateString('nl-NL')} t/m {weekEndDate.toLocaleDateString('nl-NL')}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 items-end">
                <button
                  onClick={() => setSelectedWeekStart(toLocalYmd(addDays(weekStartDate, -7)))}
                  className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700"
                >
                  ← Vorige week
                </button>
                <button
                  onClick={() => setSelectedWeekStart(toLocalYmd(startOfIsoWeek(new Date())))}
                  className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700"
                >
                  Deze week
                </button>
                <button
                  onClick={() => setSelectedWeekStart(toLocalYmd(addDays(weekStartDate, 7)))}
                  className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700"
                >
                  Volgende week →
                </button>

                <div>
                  <label className="text-xs text-gray-600 dark:text-gray-300">Ga naar week</label>
                  <input
                    type="week"
                    value={isoWeekValueFromYmd(selectedWeekStart)}
                    onChange={(e) => {
                      setSelectedWeekStart(ymdFromIsoWeekValue(e.target.value))
                    }}
                    className="w-full border rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <p>Loading...</p>
        ) : filteredEntries.length === 0 ? (
          <p>Geen entries gevonden</p>
        ) : viewMode === 'week' ? (
          <div className="space-y-4">
            <div className="border border-orange-200/60 dark:border-orange-500/30 rounded-lg p-4 bg-white/60 dark:bg-gray-900/40">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold text-gray-900 dark:text-gray-100">Entries</div>
                <div className="flex flex-wrap gap-2 text-sm">
                  <span className="px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700">{formatHours(weekHours)} uur</span>
                  <span className="px-2 py-0.5 rounded bg-yellow-200/70 dark:bg-yellow-900/40">{weekPending} pending</span>
                  <span className="px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700">{weekMissingDetails} missend</span>
                  <span className="px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700">{weekEntries.length} entries</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <div className="text-xs text-gray-600 dark:text-gray-300 mb-2">Top werknemers</div>
                  <div className="space-y-1">
                    {topUsers.map(([name, h]) => (
                      <div key={name} className="flex justify-between text-sm">
                        <span>{name}</span>
                        <span className="font-mono">{formatHours(h)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-gray-600 dark:text-gray-300 mb-2">Top opdrachtgevers</div>
                  <div className="space-y-1">
                    {topClients.map(([name, h]) => (
                      <div key={name} className="flex justify-between text-sm">
                        <span className="truncate max-w-[260px]">{name}</span>
                        <span className="font-mono">{formatHours(h)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {weekEntries.length === 0 ? (
                <div className="mt-4 text-gray-700 dark:text-gray-200">Geen entries gevonden in deze week.</div>
              ) : (
                <div className="overflow-x-auto mt-4 -mx-4 px-4 sm:mx-0 sm:px-0">
                  <table className="w-full min-w-[980px] text-sm border-collapse border border-orange-200/60 dark:border-orange-500/30">
                    <thead>
                      <tr className="bg-orange-50 dark:bg-orange-500/10">
                        <th className="border p-2 text-gray-900 dark:text-gray-100">Naam</th>
                        <th className="border p-2 text-gray-900 dark:text-gray-100">Datum</th>
                        <th className="border p-2 text-gray-900 dark:text-gray-100">Start</th>
                        <th className="border p-2 text-gray-900 dark:text-gray-100">Stop</th>
                        <th className="border p-2 text-gray-900 dark:text-gray-100">Uren</th>
                        <th className="border p-2 text-gray-900 dark:text-gray-100">Pauze</th>
                        <th className="border p-2 text-gray-900 dark:text-gray-100">Opdrachtgever</th>
                        <th className="border p-2 text-gray-900 dark:text-gray-100">Locatie</th>
                        <th className="border p-2 text-gray-900 dark:text-gray-100">Kilometers</th>
                        <th className="border p-2 text-gray-900 dark:text-gray-100">Status</th>
                        <th className="border p-2 text-gray-900 dark:text-gray-100">Actie</th>
                      </tr>
                    </thead>
                    <tbody>
                      {weekEntries.map((e) => (
                        <tr key={e.id}>
                          <td className="border p-2 text-gray-900 dark:text-gray-100">{e.name}</td>
                          <td className="border p-2 text-gray-900 dark:text-gray-100">{formatDate(e.date)}</td>
                          <td className="border p-2 text-gray-900 dark:text-gray-100">
                            <div className="space-y-1">
                              <div>{formatTime(e.start_time)}</div>
                              {sameStartEnd(e) && (
                                <span className="inline-flex items-center rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                                  Let op!! Begin tijd en eind tijd zijn hetzelfde
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="border p-2 text-gray-900 dark:text-gray-100">{formatTime(e.end_time)}</td>
                            <td className="border p-2 text-gray-900 dark:text-gray-100">{calculateHours(e)}</td>
                          <td className="border p-2 text-gray-900 dark:text-gray-100">
                            {Number(e.break_minutes ?? 0) > 0 ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-200">
                                <span aria-hidden>☕</span>
                                {(Math.max(0, Number(e.break_minutes ?? 0) || 0) / 60).toLocaleString('nl-NL', { maximumFractionDigits: 2 })}u
                              </span>
                            ) : (
                              ''
                            )}
                          </td>
                          <td className="border p-2 text-gray-900 dark:text-gray-100">{displayClient(e)}</td>
                          <td className="border p-2 text-gray-900 dark:text-gray-100">{e.location ?? ''}</td>
                          <td className="border p-2 text-gray-900 dark:text-gray-100">{e.kilometers != null && Number.isFinite(e.kilometers) ? `${e.kilometers} km` : ''}</td>
                          <td className="border p-2 text-gray-900 dark:text-gray-100">{renderStatus(e)}</td>
                          <td className="border p-2 text-gray-900 dark:text-gray-100">
                            <div className="flex gap-2">
                              {e.edited && !e.approved && (
                                <button
                                  onClick={() => approveEntry(e.id)}
                                  className="bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded"
                                >
                                  Goedkeuren
                                </button>
                              )}

                              {!e.approved && (
                                <button
                                  onClick={() => openEdit(e)}
                                  className="bg-black hover:bg-gray-900 text-white px-2 py-1 rounded"
                                >
                                  Wijzig
                                </button>
                              )}

                              {!e.approved && (
                                <button
                                  onClick={() => deleteEntry(e.id)}
                                  className="bg-red-600 text-white px-2 py-1 rounded"
                                >
                                  Verwijderen
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[1100px] text-sm border-collapse border border-orange-200/60 dark:border-orange-500/30">
              <thead>
                  <tr className="bg-orange-50 dark:bg-orange-500/10">
                  <th className="border p-2 text-gray-900 dark:text-gray-100">Naam</th>
                  <th className="border p-2 text-gray-900 dark:text-gray-100">Datum</th>
                  <th className="border p-2 text-gray-900 dark:text-gray-100">Week</th>
                  <th className="border p-2 text-gray-900 dark:text-gray-100">Start</th>
                  <th className="border p-2 text-gray-900 dark:text-gray-100">Stop</th>
                  <th className="border p-2 text-gray-900 dark:text-gray-100">Uren</th>
                  <th className="border p-2 text-gray-900 dark:text-gray-100">Pauze</th>
                  <th className="border p-2 text-gray-900 dark:text-gray-100">Opdrachtgever</th>
                  <th className="border p-2 text-gray-900 dark:text-gray-100">Locatie</th>
                  <th className="border p-2 text-gray-900 dark:text-gray-100">Kilometers</th>
                  <th className="border p-2 text-gray-900 dark:text-gray-100">Status</th>
                  <th className="border p-2 text-gray-900 dark:text-gray-100">Actie</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((e) => {
                  const iso = getIsoWeek(parseYmdToLocalDate(e.date))
                  return (
                    <tr key={e.id}>
                      <td className="border p-2 text-gray-900 dark:text-gray-100">{e.name}</td>
                      <td className="border p-2 text-gray-900 dark:text-gray-100">{formatDate(e.date)}</td>
                      <td className="border p-2 text-gray-900 dark:text-gray-100">{String(iso.week).padStart(2, '0')}</td>
                      <td className="border p-2 text-gray-900 dark:text-gray-100">
                        <div className="space-y-1">
                          <div>{formatTime(e.start_time)}</div>
                          {sameStartEnd(e) && (
                            <span className="inline-flex items-center rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                              Let op!! Begin tijd en eind tijd zijn hetzelfde
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="border p-2 text-gray-900 dark:text-gray-100">{formatTime(e.end_time)}</td>
                      <td className="border p-2 text-gray-900 dark:text-gray-100">{calculateHours(e)}</td>
                      <td className="border p-2 text-gray-900 dark:text-gray-100">
                        {Number(e.break_minutes ?? 0) > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-200">
                            <span aria-hidden>☕</span>
                            {(Math.max(0, Number(e.break_minutes ?? 0) || 0) / 60).toLocaleString('nl-NL', { maximumFractionDigits: 2 })}u
                          </span>
                        ) : (
                          ''
                        )}
                      </td>
                      <td className="border p-2 text-gray-900 dark:text-gray-100">{displayClient(e)}</td>
                      <td className="border p-2 text-gray-900 dark:text-gray-100">{e.location ?? ''}</td>
                      <td className="border p-2 text-gray-900 dark:text-gray-100">{e.kilometers != null && Number.isFinite(e.kilometers) ? `${e.kilometers} km` : ''}</td>
                      <td className="border p-2 text-gray-900 dark:text-gray-100">{renderStatus(e)}</td>
                      <td className="border p-2 text-gray-900 dark:text-gray-100">
                        <div className="flex gap-2">
                          {e.edited && !e.approved && (
                            <button
                              onClick={() => approveEntry(e.id)}
                              className="bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded"
                            >
                              Goedkeuren
                            </button>
                          )}

                          {!e.approved && (
                            <button
                              onClick={() => openEdit(e)}
                              className="bg-black hover:bg-gray-900 text-white px-2 py-1 rounded"
                            >
                              Wijzig
                            </button>
                          )}

                          {!e.approved && (
                            <button
                              onClick={() => deleteEntry(e.id)}
                              className="bg-red-600 text-white px-2 py-1 rounded"
                            >
                              Verwijderen
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

      {editing && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-900 text-white p-6 rounded space-y-3 w-full max-w-sm">
            <h3 className="font-semibold">Bewerk uren</h3>
            <div className="space-y-2">
              <div className="text-xs text-gray-300">
                {editing.name} · {editing.date}
              </div>

              <input
                type="time"
                value={editStart}
                onChange={(e) => setEditStart(e.target.value)}
                className="w-full rounded bg-gray-800 border-gray-700 text-white p-2"
              />
              <input
                type="time"
                value={editEnd}
                onChange={(e) => setEditEnd(e.target.value)}
                className="w-full rounded bg-gray-800 border-gray-700 text-white p-2"
              />

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

              <select
                value={editClientId}
                onChange={(e) => setEditClientId(e.target.value)}
                className="w-full rounded bg-gray-800 border border-gray-700 text-white p-2"
              >
                <option value="">Selecteer opdrachtgever…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              <input
                placeholder="Locatie"
                value={editLocation}
                onChange={(e) => setEditLocation(e.target.value)}
                className="w-full rounded bg-gray-800 border-gray-700 text-white p-2"
              />

              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="Kilometers"
                  value={editKilometers === '' ? '' : editKilometers}
                  onChange={(e) => setEditKilometers(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-1/2 rounded bg-gray-800 border-gray-700 text-white p-2"
                />
                <label className="flex items-center gap-2 text-sm text-gray-200">
                  <input
                    type="checkbox"
                    checked={editParkingPaid}
                    onChange={(e) => setEditParkingPaid(e.target.checked)}
                  />
                  Parkeren
                </label>
              </div>

              {editParkingPaid && (
                <input
                  type="number"
                  placeholder="Parkeerkosten"
                  value={editParkingCost === '' ? '' : editParkingCost}
                  onChange={(e) => setEditParkingCost(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full rounded bg-gray-800 border-gray-700 text-white p-2"
                />
              )}

              {editError && <div className="text-sm text-red-300">{editError}</div>}
            </div>

            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditing(null)} className="px-3 py-1">Annuleren</button>
              <button
                onClick={saveEdit}
                disabled={editBusy}
                className="px-3 py-1 bg-black text-white rounded disabled:opacity-50"
              >
                {editBusy ? 'Opslaan…' : 'Opslaan'}
              </button>
            </div>
          </div>
        </div>
      )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 mt-6 mb-6 items-end">
          <div>
            <label className="text-xs text-gray-600 dark:text-gray-300">Werknemer</label>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full border rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="all">Alle werknemers</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name ?? 'Onbekend'}
                </option>
              ))}
            </select>
          </div>

          {viewMode === 'list' ? (
            <>
              <div>
                <label className="text-xs text-gray-600 dark:text-gray-300">Vanaf</label>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-full border rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="text-xs text-gray-600 dark:text-gray-300">Tot</label>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-full border rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>
            </>
          ) : (
            <>
              <div className="hidden lg:block" />
              <div className="hidden lg:block" />
            </>
          )}

          <div>
            <label className="text-xs text-gray-600 dark:text-gray-300">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="w-full border rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="pending">Wacht op goedkeuring</option>
              <option value="approved">Goedgekeurd</option>
              <option value="needs_details">Missende details</option>
              <option value="all">Alles</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-600 dark:text-gray-300">Zoeken</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="naam, datum, klant, locatie…"
              className="w-full border rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>
        </div>

        {exportClientOpen && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <div className="w-full max-w-md rounded-lg bg-white dark:bg-gray-900 p-5 border border-orange-200/60 dark:border-orange-500/30">
              <div className="text-lg font-bold text-gray-900 dark:text-gray-100">Export CSV opdrachtgever</div>
              <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                Kies een opdrachtgever en week. Export bevat alleen goedgekeurde uren.
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-xs text-gray-600 dark:text-gray-300">Opdrachtgever</label>
                  <select
                    value={exportClientId}
                    onChange={(e) => setExportClientId(e.target.value)}
                    className="w-full border rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    <option value="">Selecteer opdrachtgever…</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-gray-600 dark:text-gray-300">Week</label>
                  <input
                    type="week"
                    value={exportWeekValue}
                    onChange={(e) => {
                      const v = e.target.value
                      setExportWeekValue(v)
                      setExportWeekStart(ymdFromIsoWeekValue(v))
                    }}
                    className="w-full border rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => setExportClientOpen(false)}
                  className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700"
                >
                  Annuleren
                </button>
                <button
                  onClick={exportClientCSV}
                  className="px-3 py-1 rounded bg-orange-600 hover:bg-orange-700 text-white"
                >
                  Export
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-6">
          {viewMode === 'list' && (
            <button
              onClick={() => {
                const d = new Date()
                d.setDate(d.getDate() - 7 * 8)
                setFrom(toLocalYmd(d))
                setTo(toLocalYmd(new Date()))
              }}
              className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700"
            >
              Laatste 8 weken
            </button>
          )}

          <div className="ml-auto flex gap-2">
            <button
              onClick={() => setViewMode('week')}
              className={
                'px-3 py-1 rounded ' +
                (viewMode === 'week' ? 'bg-gray-800 text-white' : 'bg-gray-200 dark:bg-gray-700')
              }
            >
              Weekview
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={
                'px-3 py-1 rounded ' +
                (viewMode === 'list' ? 'bg-gray-800 text-white' : 'bg-gray-200 dark:bg-gray-700')
              }
            >
              Lijst
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <KpiCard title="Totaal uren" value={formatHours(totalHours)} sub={`${filteredEntries.length} entries`} />
          <KpiCard title="Goedgekeurde uren" value={formatHours(approvedHours)} sub={`${filteredEntries.filter((e) => e.approved).length} goedgekeurd`} />
          <KpiCard title="Wacht op goedkeuring" value={String(pendingCount)} sub="edited=true & approved=false" />
          <KpiCard title="Missende details" value={String(needsDetailsCount)} sub="start/stop + gestopt" />
        </div>
      </div>
    </div>
  )
}
