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
        'id, user_id, date, start_time, end_time, manual, edited, approved, client, client_id, location, kilometers, parking_paid, parking_cost, approved_at, approved_by'
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


  const calculateHours = (start: string | null, end: string | null) => {
    const h = hoursBetween(start, end)
    if (!h) return ''
    return formatHours(h)
  }

  const clientsById = new Map(clients.map((c) => [c.id, c.name]))
  const displayClient = (e: TimeEntry) => {
    if (e.client_id && clientsById.has(String(e.client_id))) return clientsById.get(String(e.client_id))!
    return e.client ?? ''
  }

  const totalHours = filteredEntries.reduce((sum, e) => sum + hoursBetween(e.start_time, e.end_time), 0)
  const approvedHours = filteredEntries
    .filter((e) => e.approved)
    .reduce((sum, e) => sum + hoursBetween(e.start_time, e.end_time), 0)
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

  const weekHours = weekEntries.reduce((sum, e) => sum + hoursBetween(e.start_time, e.end_time), 0)
  const weekPending = weekEntries.filter((e) => e.edited && !e.approved).length
  const weekMissingDetails = weekEntries.filter((e) => needsDetails(e)).length

  const topUsers = (() => {
    const byUser = new Map<string, number>()
    for (const e of weekEntries) {
      const h = hoursBetween(e.start_time, e.end_time)
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
      const h = hoursBetween(e.start_time, e.end_time)
      byClient.set(key, (byClient.get(key) ?? 0) + h)
    }
    return Array.from(byClient.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
  })()

  const exportCSV = () => {
    if (!filteredEntries.length) {
      alert('Geen entries om te exporteren')
      return
    }

    const header = [
      'Naam',
      'Datum',
      'Week',
      'Start',
      'Eind',
      'Uren',
      'Opdrachtgever',
      'Locatie',
      'Kilometers',
      'Parkeren',
      'Parkeerkosten',
      'Goedgekeurd',
    ]

    const rows = filteredEntries.map((e) => {
      const iso = getIsoWeek(parseYmdToLocalDate(e.date))
      return [
        e.name,
        e.date,
        `${iso.year}-W${String(iso.week).padStart(2, '0')}`,
        formatTime(e.start_time),
        formatTime(e.end_time),
        calculateHours(e.start_time, e.end_time),
        displayClient(e),
        e.location ?? '',
        e.kilometers ?? '',
        e.parking_paid ? 'Ja' : 'Nee',
        e.parking_cost ?? '',
        e.approved ? 'Ja' : 'Nee',
      ]
    })

    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const suffix = `${from || 'all'}_${to || 'all'}`
    a.download = `admin-export-${suffix}.csv`
    a.click()
    URL.revokeObjectURL(url)
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
                  <label className="text-xs text-gray-600 dark:text-gray-300">Ga naar week (datum)</label>
                  <input
                    type="date"
                    value={selectedWeekStart}
                    onChange={(e) => {
                      const d = startOfIsoWeek(parseYmdToLocalDate(e.target.value))
                      setSelectedWeekStart(toLocalYmd(d))
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
                          <td className="border p-2 text-gray-900 dark:text-gray-100">{formatTime(e.start_time)}</td>
                          <td className="border p-2 text-gray-900 dark:text-gray-100">{formatTime(e.end_time)}</td>
                          <td className="border p-2 text-gray-900 dark:text-gray-100">{calculateHours(e.start_time, e.end_time)}</td>
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

                              <button
                                onClick={() => deleteEntry(e.id)}
                                className="bg-red-600 text-white px-2 py-1 rounded"
                              >
                                Verwijderen
                              </button>
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
                      <td className="border p-2 text-gray-900 dark:text-gray-100">{formatTime(e.start_time)}</td>
                      <td className="border p-2 text-gray-900 dark:text-gray-100">{formatTime(e.end_time)}</td>
                      <td className="border p-2 text-gray-900 dark:text-gray-100">{calculateHours(e.start_time, e.end_time)}</td>
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

                          <button
                            onClick={() => deleteEntry(e.id)}
                            className="bg-red-600 text-white px-2 py-1 rounded"
                          >
                            Verwijderen
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
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
