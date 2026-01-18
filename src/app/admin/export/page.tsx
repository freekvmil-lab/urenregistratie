"use client"

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

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
  approved?: boolean | null
}

export default function ExportPage() {
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
    const load = async () => {
      const { data } = await supabase.from('profiles').select('id, name').order('name')
      setUsers(data ?? [])
      // load client list (distinct clients from time_entries)
      const { data: clientRows } = await supabase.from('time_entries').select('client').not('client', 'is', null)
      const uniq = Array.from(new Set((clientRows ?? []).map((r: any) => r.client).filter(Boolean)))
      setClients(uniq)
    }
    load()
  }, [])

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
    loadEntries()
  }, [selected, from, to, onlyClient])

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

  const approvedEntries = entries.filter((e) => e.approved)

  const exportCSV = () => {
    if (!approvedEntries.length) {
      alert('Geen goedgekeurde entries om te exporteren')
      return
    }
    const header = [
      'Naam',
      'Datum',
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

    // build profile map
    const profileMap = new Map(users.map((u) => [u.id, u.name ?? 'Onbekend']))

    const rows = approvedEntries.map((e) => {
      const hours = e.start_time && e.end_time ? ((new Date(e.end_time).getTime() - new Date(e.start_time).getTime()) / 3600000).toFixed(2) : ''
      return [
        profileMap.get(e.user_id) ?? e.user_id,
        e.date,
        formatTime(e.start_time),
        formatTime(e.end_time),
        hours,
        e.client ?? '',
        e.location ?? '',
        e.kilometers ?? '',
        e.parking_paid ? 'Ja' : 'Nee',
        e.parking_cost ?? '',
        e.approved ? 'Ja' : 'Nee',
      ]
    })

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
      // group by client field
      const groups = new Map<string, any[]>()
      rows.forEach((r) => {
        const clientName = (r[5] || 'Onbekend') as string
        if (!groups.has(clientName)) groups.set(clientName, [])
        groups.get(clientName)!.push(r)
      })

      for (const [clientName, groupRows] of groups) {
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

      const rows = rowsData.map((e) => {
        const hours = e.start_time && e.end_time ? ((new Date(e.end_time).getTime() - new Date(e.start_time).getTime()) / 3600000).toFixed(2) : ''
        return [
          profileMap.get(e.user_id) ?? e.user_id,
          e.date,
          formatTime(e.start_time),
          formatTime(e.end_time),
          hours,
          e.client ?? '',
          e.location ?? '',
          e.kilometers ?? '',
          e.parking_paid ? 'Ja' : 'Nee',
          e.parking_cost ?? '',
          e.approved ? 'Ja' : 'Nee',
        ]
      })

      const header = [
        'Naam',
        'Datum',
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
    <main className="p-6">
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
        <h2 className="font-semibold mb-2">Preview ({entries.length})</h2>
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
                    <th className="border p-2 text-gray-900 dark:text-gray-100">Naam</th>
                    <th className="border p-2 text-gray-900 dark:text-gray-100">Datum</th>
                    <th className="border p-2 text-gray-900 dark:text-gray-100">Start</th>
                    <th className="border p-2 text-gray-900 dark:text-gray-100">Eind</th>
                    <th className="border p-2 text-gray-900 dark:text-gray-100">Uren</th>
                    <th className="border p-2 text-gray-900 dark:text-gray-100">Opdrachtgever</th>
                    <th className="border p-2 text-gray-900 dark:text-gray-100">Status</th>
                  </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className={!e.approved ? 'bg-yellow-50 dark:bg-yellow-900' : ''}>
                    <td className="border p-2">{users.find((u) => u.id === e.user_id)?.name ?? e.user_id}</td>
                    <td className="border p-2">{e.date}</td>
                    <td className="border p-2">{formatTime(e.start_time)}</td>
                    <td className="border p-2">{formatTime(e.end_time)}</td>
                    <td className="border p-2">{e.start_time && e.end_time ? ((new Date(e.end_time).getTime() - new Date(e.start_time).getTime()) / 3600000).toFixed(2) : ''}</td>
                    <td className="border p-2">{e.client ?? ''}</td>
                    <td className="border p-2">{e.approved ? <span className="text-green-600">Goedgekeurd</span> : <span className="text-orange-600">Niet goedgekeurd</span>}</td>
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
    </main>
  )
}
