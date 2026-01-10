'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

/* =======================
   TYPES
======================= */

interface TimeEntry {
  id: number
  user_id: string
  date: string
  start_time: string | null
  end_time: string | null
  name: string
}

interface User {
  id: string
  name: string
}

/* =======================
   COMPONENT
======================= */

export default function AdminDashboard() {
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [selectedUser, setSelectedUser] = useState<string>('all')
  const [loading, setLoading] = useState(true)

  /* =======================
     FETCH USERS
  ======================= */

  const fetchUsers = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name')
      .order('name')

    if (!error && data) {
      setUsers(data)
    }
  }

  /* =======================
     FETCH ENTRIES
  ======================= */

  const fetchEntries = async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('time_entries')
      .select(`
        id,
        user_id,
        date,
        start_time,
        end_time,
        profiles ( name )
      `)
      .order('date', { ascending: false })

    if (error) {
      console.error('fetchEntries error:', error)
      setEntries([])
    } else {
      const mapped: TimeEntry[] = (data ?? []).map((d: any) => ({
        id: d.id,
        user_id: d.user_id,
        date: d.date,
        start_time: d.start_time,
        end_time: d.end_time,
        name: d.profiles?.name ?? 'Onbekend',
      }))
      
      setEntries(mapped)
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchUsers()
    fetchEntries()
  }, [])

  /* =======================
     HELPERS
  ======================= */

  const filteredEntries =
    selectedUser === 'all'
      ? entries
      : entries.filter((e) => e.user_id === selectedUser)

  const calculateHours = (start: string | null, end: string | null) => {
    if (!start || !end) return ''
    return (
      (new Date(end).getTime() - new Date(start).getTime()) / 3600000
    ).toFixed(2)
  }

  const exportCSV = () => {
    const csv = [
      ['Naam', 'Datum', 'Start', 'Stop', 'Uren'],
      ...filteredEntries.map((e) => [
        e.name,
        e.date,
        e.start_time ?? '',
        e.end_time ?? '',
        calculateHours(e.start_time, e.end_time),
      ]),
    ]
      .map((row) => row.join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = 'urenregistratie.csv'
    a.click()

    URL.revokeObjectURL(url)
  }

  /* =======================
     RENDER
  ======================= */

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Admin Dashboard</h1>

      <div className="flex gap-4 mb-6 items-center">
        <select
          value={selectedUser}
          onChange={(e) => setSelectedUser(e.target.value)}
          className="border rounded px-2 py-1"
        >
          <option value="all">Alle werknemers</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>

        <button
          onClick={exportCSV}
          className="bg-black text-white px-4 py-2 rounded"
        >
          Export CSV
        </button>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : filteredEntries.length === 0 ? (
        <p>Geen entries gevonden</p>
      ) : (
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-2">Naam</th>
              <th className="border p-2">Datum</th>
              <th className="border p-2">Start</th>
              <th className="border p-2">Stop</th>
              <th className="border p-2">Uren</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.map((e) => (
              <tr key={e.id}>
                <td className="border p-2">{e.name}</td>
                <td className="border p-2">{e.date}</td>
                <td className="border p-2">{e.start_time ?? ''}</td>
                <td className="border p-2">{e.end_time ?? ''}</td>
                <td className="border p-2">
                  {calculateHours(e.start_time, e.end_time)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
