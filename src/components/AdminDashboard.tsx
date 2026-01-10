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
  name: string
}

interface Profile {
  id: string
  name: string | null
}

export default function AdminDashboard() {
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [users, setUsers] = useState<Profile[]>([])
  const [selectedUser, setSelectedUser] = useState<string>('all')
  const [loading, setLoading] = useState(true)

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
     FETCH ENTRIES (NO JOIN)
  ======================= */

  const fetchEntries = async () => {
    setLoading(true)

    const { data: entriesData, error } = await supabase
      .from('time_entries')
      .select('id, user_id, date, start_time, end_time')
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
              {u.name ?? 'Onbekend'}
            </option>
          ))}
        </select>
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
        <UserManagement />
    </div>
  )
}
