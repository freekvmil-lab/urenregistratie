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

interface Client {
  id: string
  name: string
}

export default function UserManagement() {
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  const [clients, setClients] = useState<Client[]>([])
  const [employeeClientIds, setEmployeeClientIds] = useState<Record<string, string[]>>({})

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
      .is('deleted_at', null)
      .order('name')

    if (!error && data) {
      setUsers(data as Profile[])
    }

    setLoading(false)
  }

  const fetchClients = async () => {
    const { data, error } = await supabase.from('clients').select('id, name').order('name')
    if (error) {
      console.warn('clients load failed', error)
      setClients([])
      return
    }
    const mapped = (data ?? []).map((r: any) => ({ id: String(r.id), name: String(r.name) }))
    setClients(mapped.filter((c) => c.id && c.name))
  }

  const fetchEmployeeClients = async () => {
    const { data, error } = await supabase
      .from('employee_clients')
      .select('employee_id, client_id')

    if (error) {
      // Table might not exist yet, or RLS might block.
      console.warn('employee_clients load failed', error)
      setEmployeeClientIds({})
      return
    }

    const next: Record<string, string[]> = {}
    for (const row of (data ?? []) as any[]) {
      const employeeId = String(row.employee_id ?? '')
      const clientId = String(row.client_id ?? '')
      if (!employeeId || !clientId) continue
      if (!next[employeeId]) next[employeeId] = []
      next[employeeId].push(clientId)
    }
    setEmployeeClientIds(next)
  }

  useEffect(() => {
    fetchUsers()
    fetchClients()
    fetchEmployeeClients()
  }, [])

  const setClientAssigned = async (employeeId: string, clientId: string, assigned: boolean) => {
    setSaving(employeeId)

    // Optimistic local update
    setEmployeeClientIds((prev) => {
      const current = new Set(prev[employeeId] ?? [])
      if (assigned) current.add(clientId)
      else current.delete(clientId)
      return { ...prev, [employeeId]: Array.from(current) }
    })

    try {
      if (assigned) {
        const { error } = await supabase
          .from('employee_clients')
          .upsert({ employee_id: employeeId, client_id: clientId }, { onConflict: 'employee_id,client_id' })
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('employee_clients')
          .delete()
          .eq('employee_id', employeeId)
          .eq('client_id', clientId)
        if (error) throw error
      }

      await fetchEmployeeClients()
    } catch (err: any) {
      alert(err?.message ?? 'Opslaan opdrachtgevers mislukt')
      await fetchEmployeeClients()
    } finally {
      setSaving(null)
    }
  }

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

  const clientsById = new Map(clients.map((c) => [c.id, c.name]))

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
            className="bg-orange-600 text-white px-3 py-2 rounded hover:bg-orange-700 disabled:opacity-50"
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
            <th className="border p-2 text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700">Opdrachtgevers</th>
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
                <details>
                  <summary className="cursor-pointer select-none">
                    {(() => {
                      const assignedIds = employeeClientIds[u.id] ?? []
                      const assignedNames = assignedIds
                        .map((id) => clientsById.get(id))
                        .filter(Boolean) as string[]
                      if (assignedNames.length === 0) return 'Alles (geen selectie)'
                      return `${assignedNames.length} geselecteerd`
                    })()}
                  </summary>

                  <div className="mt-2 max-h-48 overflow-auto rounded border border-gray-300 p-2">
                    {clients.length === 0 ? (
                      <div className="text-sm opacity-70">Geen opdrachtgevers gevonden.</div>
                    ) : (
                      clients.map((c) => {
                        const assignedSet = new Set(employeeClientIds[u.id] ?? [])
                        const checked = assignedSet.has(c.id)
                        return (
                          <label key={c.id} className="flex items-center gap-2 py-1">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={saving === u.id}
                              onChange={(e) => setClientAssigned(u.id, c.id, e.target.checked)}
                            />
                            <span>{c.name}</span>
                          </label>
                        )
                      })
                    )}
                    <div className="mt-2 text-xs opacity-70">
                      Tip: als je niets aanvinkt, ziet de werknemer alle opdrachtgevers.
                    </div>
                  </div>
                </details>
              </td>

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
