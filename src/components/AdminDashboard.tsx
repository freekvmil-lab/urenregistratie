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
  edited?: boolean
  approved?: boolean
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
     FETCH ENTRIES
  ======================= */

  const fetchEntries = async () => {
    setLoading(true)

    const { data: entriesData, error } = await supabase
      .from('time_entries')
      .select(
        'id, user_id, date, start_time, end_time, edited, approved'
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

  useEffect(() => {
    fetchUsers()
    fetchEntries()
  }, [])

  /* =======================
     ACTIONS
  ======================= */

  const approveEntry = async (entryId: number) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase
      .from('time_entries')
      .update({
        approved: true,
        approved_at: new Date().toISOString(),
        approved_by: user.id,
      })
      .eq('id', entryId)

    fetchEntries()
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
        // refresh
        fetchEntries()
        alert('Entry verwijderd')
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

  const filteredEntries =
    selectedUser === 'all'
      ? entries
      : entries.filter((e) => e.user_id === selectedUser)
  
  const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('nl-NL')
  }

  const formatTime = (date: string | null) => {
  if (!date) return ''
  return new Date(date).toLocaleTimeString('nl-NL', {
    hour: '2-digit',
    minute: '2-digit',
  })
  }


  const calculateHours = (start: string | null, end: string | null) => {
    if (!start || !end) return ''
    return (
      (new Date(end).getTime() - new Date(start).getTime()) / 3600000
    ).toFixed(2)
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
    <div className="p-6 space-y-8">
      <div>
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
              <tr className="bg-gray-100 dark:bg-gray-700">
                <th className="border p-2 text-gray-900 dark:text-gray-100">Naam</th>
                <th className="border p-2 text-gray-900 dark:text-gray-100">Datum</th>
                <th className="border p-2 text-gray-900 dark:text-gray-100">Start</th>
                <th className="border p-2 text-gray-900 dark:text-gray-100">Stop</th>
                <th className="border p-2 text-gray-900 dark:text-gray-100">Uren</th>
                <th className="border p-2 text-gray-900 dark:text-gray-100">Status</th>
                <th className="border p-2 text-gray-900 dark:text-gray-100">Actie</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((e) => (
                <tr key={e.id}>
                  <td className="border p-2 text-gray-900 dark:text-gray-100">{e.name}</td>
                  <td className="border p-2 text-gray-900 dark:text-gray-100">{formatDate(e.date)}</td>
                  <td className="border p-2 text-gray-900 dark:text-gray-100">{formatTime(e.start_time)}</td>
                  <td className="border p-2 text-gray-900 dark:text-gray-100">{formatTime(e.end_time)}</td>
                  <td className="border p-2 text-gray-900 dark:text-gray-100">
                    {calculateHours(e.start_time, e.end_time)}
                  </td>
                  <td className="border p-2 text-gray-900 dark:text-gray-100">{renderStatus(e)}</td>
                  <td className="border p-2 text-gray-900 dark:text-gray-100">
                    <div className="flex gap-2">
                      {e.edited && !e.approved && (
                        <button
                          onClick={() => approveEntry(e.id)}
                          className="bg-green-600 text-white px-2 py-1 rounded"
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
        )}
      </div>

      {/* Rolbeheer */}
      <UserManagement />
    </div>
  )
}
