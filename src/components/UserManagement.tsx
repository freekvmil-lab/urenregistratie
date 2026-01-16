'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Profile {
  id: string
  name: string | null
  email: string | null
  role: 'admin' | 'employee'
  hourly_rate?: number | null
  home_address?: string | null
}

export default function UserManagement() {
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  const fetchUsers = async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, email, role, hourly_rate, home_address')
      .order('name')

    if (!error && data) {
      setUsers(data as Profile[])
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  const updateRole = async (userId: string, role: 'admin' | 'employee') => {
    setSaving(userId)

    const { error } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', userId)

    if (error) {
      alert('Rol wijzigen mislukt')
      console.error(error)
    }

    await fetchUsers()
    setSaving(null)
  }

  const updateHourlyRate = async (userId: string, hourly_rate: number | null) => {
    setSaving(userId)

    const { error } = await supabase
      .from('profiles')
      .update({ hourly_rate })
      .eq('id', userId)

    if (error) {
      alert('Uurtarief wijzigen mislukt')
      console.error(error)
    }

    await fetchUsers()
    setSaving(null)
  }

  const updateHomeAddress = async (userId: string, home_address: string | null) => {
    setSaving(userId)

    const { error } = await supabase
      .from('profiles')
      .update({ home_address })
      .eq('id', userId)

    if (error) {
      alert('Adres wijzigen mislukt')
      console.error(error)
    }

    await fetchUsers()
    setSaving(null)
  }

  if (loading) return <p>Gebruikers laden…</p>

  return (
    <div className="p-4 border rounded mt-6">
      <h2 className="text-xl font-bold mb-4">Werknemers</h2>

      <table className="w-full border-collapse border border-gray-300">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-2 text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700">Naam</th>
            <th className="border p-2 text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700">E-mail</th>
            <th className="border p-2 text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700">Uurtarief</th>
            <th className="border p-2 text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700">Thuisadres</th>
            <th className="border p-2 text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700">Rol</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td className="border p-2">
               <input
                  value={u.name ?? ''}
                  onChange={(e) =>
                    setUsers((prev) =>
                      prev.map((p) =>
                        p.id === u.id ? { ...p, name: e.target.value } : p
                     )
                    )
                  }
                  onBlur={async () => {
                    await supabase
                      .from('profiles')
                      .update({ name: u.name })
                      .eq('id', u.id)
                  }}
                  className="w-full bg-transparent border-b border-gray-400
                    text-gray-900 dark:text-gray-100"
                  placeholder="Naam invoeren"
                />
            </td>

              <td className="border p-2 text-gray-900 dark:text-gray-100">{u.email ?? '—'}</td>
              <td className="border p-2 text-gray-900 dark:text-gray-100">
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={u.hourly_rate ?? ''}
                  disabled={saving === u.id}
                  onChange={(e) => {
                    const v = e.target.value
                    setUsers((prev) =>
                      prev.map((p) =>
                        p.id === u.id
                          ? { ...p, hourly_rate: v === '' ? null : Number(v) }
                          : p
                      )
                    )
                  }}
                  onBlur={async () => {
                    const current = users.find((x) => x.id === u.id)?.hourly_rate ?? null
                    await updateHourlyRate(u.id, current)
                  }}
                  className="w-24 bg-transparent border-b border-gray-400 text-gray-900 dark:text-gray-100"
                  placeholder="€ / uur"
                />
              </td>

              <td className="border p-2 text-gray-900 dark:text-gray-100">
                <input
                  value={u.home_address ?? ''}
                  disabled={saving === u.id}
                  onChange={(e) =>
                    setUsers((prev) =>
                      prev.map((p) =>
                        p.id === u.id ? { ...p, home_address: e.target.value } : p
                      )
                    )
                  }
                  onBlur={async () => {
                    const current = users.find((x) => x.id === u.id)?.home_address ?? null
                    await updateHomeAddress(u.id, current && String(current).trim() ? String(current).trim() : null)
                  }}
                  className="w-full bg-transparent border-b border-gray-400 text-gray-900 dark:text-gray-100"
                  placeholder="Bijv. Dorpsstraat 1, 1234 AB Plaats"
                />
              </td>

              <td className="border p-2 text-gray-900 dark:text-gray-100">
                <select
                  value={u.role}
                  disabled={saving === u.id}
                  onChange={(e) =>
                    updateRole(
                      u.id,
                      e.target.value as 'admin' | 'employee'
                    )
                  }
                  className="border rounded px-2 py-1"
                >
                  <option value="employee">Werknemer</option>
                  <option value="admin">Admin</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
