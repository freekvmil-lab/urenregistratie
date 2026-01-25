"use client"

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAdminGuard } from '@/lib/useAdminGuard'

interface Profile { id: string; name?: string | null }
interface Entry {
  id: number
  user_id: string
  date: string
  start_time: string | null
  end_time: string | null
  client?: string | null
  location?: string | null
  kilometers?: number | null
  parking_paid?: boolean | null
  parking_cost?: number | null
  break_minutes?: number | null
  approved?: boolean | null
}

export default function ExportPage() {
  const { allowed } = useAdminGuard()

  const [users, setUsers] = useState<Profile[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [clients, setClients] = useState<string[]>([])
  const [onlyClient, setOnlyClient] = useState<string | ''>('')
  const [groupByClient, setGroupByClient] = useState(false)

  useEffect(() => {
    if (allowed !== true) return
    const load = async () => {
      const { data } = await supabase.from('profiles').select('id, name').order('name')
      setUsers(data ?? [])
      // load client list (distinct clients from time_entries)
      const { data: clientRows } = await supabase.from('time_entries').select('client').not('client', 'is', null)
      const uniq = Array.from(new Set((clientRows ?? []).map((r: any) => r.client).filter(Boolean)))
      setClients(uniq)
    }
    load()
  }, [allowed])

  const loadEntries = async () => {
    if (!selected.length) {
      setEntries([])
      return
    }

    setLoading(true)
    try {
      const q = supabase
        .from('time_entries')
        .select('*')
        .in('user_id', selected)
        .order('date', { ascending: true })

      if (from) q.gte('date', from)
      if (to) q.lte('date', to)

      const { data } = await q
      let rows = (data ?? []) as Entry[]
      if (onlyClient) rows = rows.filter((r) => r.client === onlyClient)
      setEntries(rows)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (allowed !== true) return
    loadEntries()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, selected, from, to, onlyClient])

  if (allowed === null) return <p>Controleren…</p>
  if (!allowed) return <p>Geen toegang</p>

  const toggle = (id: string) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  const setThisWeek = () => {
    const now = new Date()
    const day = now.getDay() || 7
    const start = new Date(now)
    start.setDate(now.getDate() - day + 1)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    setFrom(start.toISOString().slice(0, 10))
    setTo(end.toISOString().slice(0, 10))
  }

  const setThisMonth = () => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    setFrom(start.toISOString().slice(0, 10))
    setTo(end.toISOString().slice(0, 10))
  }

  const formatTime = (t: string | null) =>
    t ? new Date(t).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : ''

  const parseYmdToLocalDate = (ymd: string) => {
    const [y, m, d] = String(ymd).split('-').map((x) => Number(x))
    if (!y || !m || !d) return new Date(ymd)
    const dt = new Date(y, m - 1, d)
    dt.setHours(0, 0, 0, 0)
    return dt
  }

  const getIsoWeek = (date: Date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    const day = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - day)
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
    return { year: d.getUTCFullYear(), week }
  }

  const formatNumberNl = (n: number, maxFractionDigits = 2) => {
    if (!Number.isFinite(n)) return ''
    return n.toLocaleString('nl-NL', { maximumFractionDigits: maxFractionDigits })
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

  const entryHours = (e: Entry) => {
    const base = hoursBetween(e.start_time, e.end_time)
    const br = Math.max(0, Number(e.break_minutes ?? 0) || 0) / 60
    return Math.max(0, base - br)
  }

  type SummaryRow = {
    weekLabel: string
    client: string
    employee: string
    hoursTotal: number
    kmTotal: number
    parkingTotal: number
    breakHoursTotal: number
  }

  const buildSummary = (rowsData: Entry[], profileMap: Map<string, string>) => {
    const groups = new Map<string, SummaryRow>()

    for (const e of rowsData) {
      const iso = getIsoWeek(parseYmdToLocalDate(e.date))
      const weekLabel = `Week ${iso.week}`
      const clientName = String(e.client ?? 'Onbekend').trim() || 'Onbekend'
      const employeeName = profileMap.get(e.user_id) ?? e.user_id

      const h = e.start_time && e.end_time ? entryHours(e) : 0
      const brHrs = Math.max(0, Number(e.break_minutes ?? 0) || 0) / 60
      const km = e.kilometers != null && Number.isFinite(e.kilometers) ? Number(e.kilometers) : 0
      const parking = e.parking_paid ? Math.max(0, Number(e.parking_cost ?? 0) || 0) : 0

      const key = `${iso.year}-W${String(iso.week).padStart(2, '0')}|${clientName}|${employeeName}`
      const existing = groups.get(key)
      if (!existing) {
        groups.set(key, {
          weekLabel,
          client: clientName,
          employee: employeeName,
          hoursTotal: h,
          kmTotal: km,
          parkingTotal: parking,
          breakHoursTotal: brHrs,
        })
      } else {
        existing.hoursTotal += h
        existing.kmTotal += km
        existing.parkingTotal += parking
        existing.breakHoursTotal += brHrs
      }
    }

    return Array.from(groups.values()).sort((a, b) => {
      const byWeek = a.weekLabel.localeCompare(b.weekLabel)
      if (byWeek !== 0) return byWeek
      const byClient = a.client.localeCompare(b.client)
      if (byClient !== 0) return byClient
      return a.employee.localeCompare(b.employee)
    })
  }

  const approvedEntries = entries.filter((e) => e.approved)
  const profileMap = new Map(users.map((u) => [u.id, u.name ?? 'Onbekend']))
  const summaryRows = buildSummary(approvedEntries, profileMap)
  const totalHours = summaryRows.reduce((s, r) => s + (Number.isFinite(r.hoursTotal) ? r.hoursTotal : 0), 0)

  const exportCSV = () => {
    if (!approvedEntries.length) {
      alert('Geen goedgekeurde entries om te exporteren')
      return
    }

    const header = ['Week', 'Opdrachtgever', 'Werknemer', 'Uren totaal', 'KM', 'Parkeren', 'Pauze']

    // build profile map
    const profileMap = new Map(users.map((u) => [u.id, u.name ?? 'Onbekend']))

    const summary = buildSummary(approvedEntries, profileMap)
    const rows = summary.map((r) => [
      r.weekLabel,
      r.client,
      r.employee,
      formatNumberNl(r.hoursTotal, 2),
      formatNumberNl(r.kmTotal, 1),
      formatNumberNl(r.parkingTotal, 2),
      formatNumberNl(r.breakHoursTotal, 2),
    ])

    const buildAndDownload = (rowsForFile: any[], suffix = '') => {
      const csv = [header, ...rowsForFile]
        .map((r) => (r as any[]).map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(','))
        .join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const now = new Date().toISOString().slice(0, 10)
      a.download = `export-entries-${suffix || 'all'}-${now}.csv`
      a.click()
      URL.revokeObjectURL(url)
    }

    if (groupByClient) {
      const byClient = new Map<string, any[]>()
      for (const r of rows) {
        const clientName = String(r[1] || 'Onbekend')
        if (!byClient.has(clientName)) byClient.set(clientName, [])
        byClient.get(clientName)!.push(r)
      }

      for (const [clientName, groupRows] of byClient) {
        buildAndDownload(groupRows, clientName.replace(/[^a-z0-9]/gi, '_'))
      }
      return
    }

    buildAndDownload(rows)
  }

  const exportClient = async (clientName: string) => {
    setLoading(true)
    try {
      let q = supabase.from('time_entries').select('*').eq('client', clientName).eq('approved', true).order('date', { ascending: true })
      if (from) q = q.gte('date', from)
      if (to) q = q.lte('date', to)

      const { data } = await q
      const rowsData = (data ?? []) as Entry[]
      if (!rowsData.length) {
        alert('Geen goedgekeurde entries voor opdrachtgever ' + clientName)
        return
      }

      // build profile map
      const profileMap = new Map(users.map((u) => [u.id, u.name ?? 'Onbekend']))

      const header = ['Week', 'Opdrachtgever', 'Werknemer', 'Uren totaal', 'KM', 'Parkeren', 'Pauze']
      const summary = buildSummary(rowsData, profileMap)
      const rows = summary.map((r) => [
        r.weekLabel,
        r.client,
        r.employee,
        formatNumberNl(r.hoursTotal, 2),
        formatNumberNl(r.kmTotal, 1),
        formatNumberNl(r.parkingTotal, 2),
        formatNumberNl(r.breakHoursTotal, 2),
      ])

      const csv = [header, ...rows].map((r) => (r as any[]).map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const now = new Date().toISOString().slice(0, 10)
      a.download = `export-${clientName.replace(/[^a-z0-9]/gi, '_')}-${now}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="px-4 py-4 sm:p-6">
      <h1 className="text-2xl font-bold mb-4">Exporteer uren</h1>

      <div className="mb-4 p-4 border rounded">
        <div className="mb-2 flex items-center justify-between">
          <div>Selecteer werknemers</div>
          <div className="flex gap-2">
            <button onClick={() => setSelected(users.map((u) => u.id))} className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">Selecteer alles</button>
            <button onClick={() => setSelected([])} className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">Wis selectie</button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 max-w-xl">
          {users.map((u) => (
            <label key={u.id} className="flex items-center gap-2">
              <input type="checkbox" checked={selected.includes(u.id)} onChange={() => toggle(u.id)} />
              <span>{u.name ?? 'Onbekend'}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="mb-4 p-4 border rounded">
        <div className="flex gap-2 items-center">
          <label className="text-sm">Vanaf</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border rounded px-2 py-1" />
          <label className="text-sm">Tot</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border rounded px-2 py-1" />
          <button onClick={loadEntries} className="ml-auto px-3 py-1 bg-gray-800 text-white rounded">Laad</button>
        </div>

        <div className="mt-3 flex gap-2 items-center">
          <button onClick={setThisWeek} className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded">Deze week</button>
          <button onClick={setThisMonth} className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded">Deze maand</button>
        </div>
      </div>

      <div className="mb-4 p-4 border rounded">
        <div className="mb-2">Opdrachtgever export</div>
        <div className="flex gap-4 items-center">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={groupByClient} onChange={(e) => setGroupByClient(e.target.checked)} />
            Per opdrachtgever exporteren
          </label>

            <label className="flex items-center gap-2">
            <span className="text-sm">Opdrachtgever (filter)</span>
            <select value={onlyClient} onChange={(e) => setOnlyClient(e.target.value)} className="border rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
              <option value="">Alle</option>
              {clients.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {clients.map((c) => (
            <div key={c} className="flex items-center justify-between border rounded p-2">
              <div className="truncate">{c}</div>
              <div className="flex gap-2">
                <button onClick={() => { setOnlyClient(c); loadEntries(); }} className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">Filter</button>
                <button onClick={() => exportClient(c)} className="px-2 py-1 bg-orange-600 hover:bg-orange-700 text-white rounded">Export alle werknemers</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <h2 className="font-semibold mb-2">Preview ({summaryRows.length} regels)</h2>
        {entries.length - approvedEntries.length > 0 && (
          <div className="mb-2 p-2 bg-yellow-100 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 rounded">
            Let op: {entries.length - approvedEntries.length} niet-goedgekeurde entry(s) zichtbaar in de preview. Export zal alleen goedgekeurde uren bevatten.
          </div>
        )}
        {loading ? (
          <p>Laden…</p>
        ) : entries.length === 0 ? (
          <p>Geen entries</p>
        ) : (
          <div className="overflow-auto max-w-full">
            <table className="w-full border-collapse border">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-700">
                    <th className="border p-2 text-gray-900 dark:text-gray-100">Week</th>
                    <th className="border p-2 text-gray-900 dark:text-gray-100">Opdrachtgever</th>
                    <th className="border p-2 text-gray-900 dark:text-gray-100">Werknemer</th>
                    <th className="border p-2 text-gray-900 dark:text-gray-100">Uren totaal</th>
                    <th className="border p-2 text-gray-900 dark:text-gray-100">KM</th>
                    <th className="border p-2 text-gray-900 dark:text-gray-100">Parkeren</th>
                    <th className="border p-2 text-gray-900 dark:text-gray-100">Pauze</th>
                  </tr>
              </thead>
              <tbody>
                {summaryRows.map((r) => (
                  <tr key={`${r.weekLabel}|${r.client}|${r.employee}`}>
                    <td className="border p-2">{r.weekLabel}</td>
                    <td className="border p-2">{r.client}</td>
                    <td className="border p-2">{r.employee}</td>
                    <td className="border p-2">{formatNumberNl(r.hoursTotal, 2)}</td>
                    <td className="border p-2">{formatNumberNl(r.kmTotal, 1)}</td>
                    <td className="border p-2">{formatNumberNl(r.parkingTotal, 2)}</td>
                    <td className="border p-2">{formatNumberNl(r.breakHoursTotal, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button onClick={exportCSV} className="px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded disabled:opacity-50" disabled={!approvedEntries.length}>Export CSV</button>
      </div>

      {summaryRows.length > 0 && (
        <div className="mt-4 flex justify-end">
          <div className="inline-flex items-center gap-2 rounded-lg border border-orange-200/60 dark:border-orange-500/30 bg-white/60 dark:bg-gray-900/40 px-4 py-2">
            <span className="text-sm text-gray-700 dark:text-gray-200">Totaal uren</span>
            <span className="font-mono font-semibold text-gray-900 dark:text-gray-100">
              {formatNumberNl(totalHours, 2)}
            </span>
          </div>
        </div>
      )}
    </main>
  )
}
