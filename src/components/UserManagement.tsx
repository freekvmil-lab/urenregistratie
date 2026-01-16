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

  const [createEmail, setCreateEmail] = useState('')
  const [createName, setCreateName] = useState('')
  const [createRole, setCreateRole] = useState<'admin' | 'employee'>('employee')
  const [createHourlyRate, setCreateHourlyRate] = useState('')
  const [createHomeAddress, setCreateHomeAddress] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [createMessage, setCreateMessage] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

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

  const inviteUser = async () => {
    setCreateMessage(null)

    const email = createEmail.trim().toLowerCase()
    if (!email) {
      setCreateMessage('Vul een e-mailadres in.')
      return
    }

    const hourlyRateNum = createHourlyRate.trim() ? Number(createHourlyRate.trim()) : null
    if (createHourlyRate.trim() && Number.isNaN(hourlyRateNum)) {
      setCreateMessage('Uurtarief moet een getal zijn.')
      return
    }

    try {
      setCreateBusy(true)
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const accessToken = session?.access_token
      if (!accessToken) {
        setCreateMessage('Niet ingelogd.')
        return
      }

      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          email,
          name: createName.trim() || null,
          role: createRole,
          hourly_rate: hourlyRateNum,
          home_address: createHomeAddress.trim() || null,
        }),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setCreateMessage(json?.details ? String(json.details) : 'Toevoegen mislukt.')
        return
      }

      setCreateMessage('Uitnodiging verstuurd.')
      setCreateEmail('')
      setCreateName('')
      setCreateRole('employee')
      setCreateHourlyRate('')
      setCreateHomeAddress('')
      await fetchUsers()
    } catch (err: any) {
      setCreateMessage(err?.message ?? 'Toevoegen mislukt.')
    } finally {
      setCreateBusy(false)
    }
  }

  const deleteUser = async (userId: string, label: string) => {
    const confirmed = window.confirm(`Weet je zeker dat je ${label} wilt verwijderen?`)
    if (!confirmed) return

    try {
      setDeletingId(userId)
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const accessToken = session?.access_token
      if (!accessToken) {
        alert('Niet ingelogd.')
        return
      }

      const res = await fetch(`/api/admin/users?id=${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(json?.details ? String(json.details) : 'Verwijderen mislukt.')
        return
      }

      await fetchUsers()
    } catch (err: any) {
      alert(err?.message ?? 'Verwijderen mislukt.')
    } finally {
      setDeletingId(null)
    }
  }

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

      <div className="border border-gray-200 rounded p-3 mb-4 bg-white dark:bg-transparent">
        <h3 className="font-semibold mb-2 text-gray-900 dark:text-gray-100">Werknemer toevoegen</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm mb-1 text-gray-700 dark:text-gray-200">E-mail</label>
            <input
              value={createEmail}
              onChange={(e) => setCreateEmail(e.target.value)}
              className="w-full bg-transparent border rounded px-2 py-1 text-gray-900 dark:text-gray-100"
              placeholder="naam@bedrijf.nl"
            />
          </div>

          <div>
            <label className="block text-sm mb-1 text-gray-700 dark:text-gray-200">Naam</label>
            <input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              className="w-full bg-transparent border rounded px-2 py-1 text-gray-900 dark:text-gray-100"
              placeholder="Voornaam Achternaam"
            />
          </div>

          <div>
            <label className="block text-sm mb-1 text-gray-700 dark:text-gray-200">Rol</label>
            <select
              value={createRole}
              onChange={(e) => setCreateRole(e.target.value as 'admin' | 'employee')}
              className="w-full border rounded px-2 py-1"
            >
              <option value="employee">Werknemer</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div>
            <label className="block text-sm mb-1 text-gray-700 dark:text-gray-200">Uurtarief (optioneel)</label>
            <input
              value={createHourlyRate}
              onChange={(e) => setCreateHourlyRate(e.target.value)}
              className="w-full bg-transparent border rounded px-2 py-1 text-gray-900 dark:text-gray-100"
              placeholder="bijv. 25"
              inputMode="decimal"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm mb-1 text-gray-700 dark:text-gray-200">Thuisadres (optioneel)</label>
            <input
              value={createHomeAddress}
              onChange={(e) => setCreateHomeAddress(e.target.value)}
              className="w-full bg-transparent border rounded px-2 py-1 text-gray-900 dark:text-gray-100"
              placeholder="Straat 1, 1234 AB Plaats"
            />
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={inviteUser}
            disabled={createBusy}
            className="bg-blue-600 text-white px-3 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {createBusy ? 'Bezig…' : 'Uitnodigen'}
          </button>
          {createMessage && <div className="text-sm text-gray-700 dark:text-gray-200">{createMessage}</div>}
        </div>
      </div>

      <table className="w-full border-collapse border border-gray-300">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-2 text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700">Naam</th>
            <th className="border p-2 text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700">E-mail</th>
            <th className="border p-2 text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700">Uurtarief</th>
            <th className="border p-2 text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700">Thuisadres</th>
            <th className="border p-2 text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700">Rol</th>
            <th className="border p-2 text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700">Acties</th>
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

              <td className="border p-2 text-right">
                <button
                  onClick={() => deleteUser(u.id, u.name ?? u.email ?? 'deze gebruiker')}
                  disabled={deletingId === u.id}
                  className="text-red-600 hover:text-red-800 disabled:opacity-50"
                >
                  {deletingId === u.id ? 'Bezig…' : 'Verwijderen'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
