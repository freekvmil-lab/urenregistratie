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

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('profiles').select('id, name').order('name')
      setUsers(data ?? [])
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
      setEntries((data ?? []) as Entry[])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadEntries()
  }, [selected, from, to])

  const toggle = (id: string) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  const formatTime = (t: string | null) =>
    t ? new Date(t).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : ''

  const exportCSV = () => {
    if (!entries.length) return
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

    const rows = entries.map((e) => {
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

    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const now = new Date().toISOString().slice(0, 10)
    a.download = `export-entries-${now}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-4">Exporteer uren</h1>

      <div className="mb-4 p-4 border rounded">
        <div className="mb-2">Selecteer werknemers</div>
        <div className="grid grid-cols-2 gap-2 max-w-xl">
          {users.map((u) => (
            <label key={u.id} className="flex items-center gap-2">
              <input type="checkbox" checked={selected.includes(u.id)} onChange={() => toggle(u.id)} />
              <span>{u.name ?? 'Onbekend'}</span>
            </label>
          ))}
        </div>

        <div className="mt-4 flex gap-2 items-center">
          <label className="text-sm">Vanaf</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border rounded px-2 py-1" />
          <label className="text-sm">Tot</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border rounded px-2 py-1" />
          <button onClick={loadEntries} className="ml-auto px-3 py-1 bg-gray-800 text-white rounded">Laad</button>
        </div>
      </div>

      <div className="mb-4">
        <h2 className="font-semibold mb-2">Preview ({entries.length})</h2>
        {loading ? (
          <p>Laden…</p>
        ) : entries.length === 0 ? (
          <p>Geen entries</p>
        ) : (
          <div className="overflow-auto max-w-full">
            <table className="w-full border-collapse border">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border p-2">Naam</th>
                  <th className="border p-2">Datum</th>
                  <th className="border p-2">Start</th>
                  <th className="border p-2">Eind</th>
                  <th className="border p-2">Uren</th>
                  <th className="border p-2">Opdrachtgever</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="border p-2">{users.find((u) => u.id === e.user_id)?.name ?? e.user_id}</td>
                    <td className="border p-2">{e.date}</td>
                    <td className="border p-2">{formatTime(e.start_time)}</td>
                    <td className="border p-2">{formatTime(e.end_time)}</td>
                    <td className="border p-2">{e.start_time && e.end_time ? ((new Date(e.end_time).getTime() - new Date(e.start_time).getTime()) / 3600000).toFixed(2) : ''}</td>
                    <td className="border p-2">{e.client ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button onClick={exportCSV} className="px-3 py-2 bg-green-600 text-white rounded" disabled={!entries.length}>Export CSV</button>
      </div>
    </main>
  )
}
