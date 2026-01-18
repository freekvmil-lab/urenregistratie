'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Profile = {
  id: string
  name: string | null
}

type AvailabilityRow = {
  id: number
  user_id: string
  date: string
  start_time: string | null
  end_time: string | null
  status: 'available' | 'unavailable'
  note: string | null
}

const todayYmd = () => {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const addDaysYmd = (ymd: string, days: number) => {
  const [y, m, d] = String(ymd).split('-').map((x) => Number(x))
  const dt = new Date(y, (m || 1) - 1, d || 1)
  dt.setDate(dt.getDate() + days)
  const yyyy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const displayTime = (t: string | null) => (t ? String(t).slice(0, 5) : '—')

export default function AdminAvailabilityPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null)

  const [users, setUsers] = useState<Profile[]>([])
  const [rows, setRows] = useState<AvailabilityRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedUser, setSelectedUser] = useState<string>('all')
  const [from, setFrom] = useState(() => addDaysYmd(todayYmd(), -14))
  const [to, setTo] = useState(() => addDaysYmd(todayYmd(), 28))

  useEffect(() => {
    const checkRole = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setAllowed(false)
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      setAllowed(profile?.role === 'admin')
    }

    checkRole()
  }, [])

  const loadUsers = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name')
      .is('deleted_at', null)
      .order('name')

    if (error) {
      setUsers([])
      return
    }

    setUsers((data ?? []) as Profile[])
  }

  const loadAvailability = async () => {
    setLoading(true)
    setError(null)

    try {
      let q = supabase
        .from('availability')
        .select('id, user_id, date, start_time, end_time, status, note')
        .order('date', { ascending: true })
        .order('start_time', { ascending: true })

      if (selectedUser !== 'all') q = q.eq('user_id', selectedUser)
      if (from) q = q.gte('date', from)
      if (to) q = q.lte('date', to)

      const { data, error } = await q

      if (error) {
        const msg = String(error.message || 'Laden mislukt')
        if (msg.toLowerCase().includes('relation') && msg.toLowerCase().includes('availability')) {
          setError('Tabel availability bestaat nog niet. Run eerst availability.sql in Supabase.')
        } else {
          setError(msg)
        }
        setRows([])
        return
      }

      setRows((data ?? []) as AvailabilityRow[])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (allowed) {
      loadUsers()
      loadAvailability()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed])

  useEffect(() => {
    if (allowed) loadAvailability()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUser, from, to])

  const nameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const u of users) m.set(u.id, u.name ?? 'Onbekend')
    return m
  }, [users])

  const grouped = useMemo(() => {
    const m = new Map<string, AvailabilityRow[]>()
    for (const r of rows) {
      const key = r.date
      const list = m.get(key) ?? []
      list.push(r)
      m.set(key, list)
    }
    return Array.from(m.entries())
  }, [rows])

  if (allowed === null) return <p>Controleren…</p>
  if (!allowed) return <p>Geen toegang</p>

  return (
    <main className="p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Beschikbaarheid (admin)</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300">Overzicht voor alle werknemers.</p>
      </header>

      <section className="border border-orange-200/60 dark:border-orange-500/30 rounded-lg p-4 bg-white/60 dark:bg-gray-900/40">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
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

          <div className="flex gap-2">
            <button
              onClick={loadAvailability}
              disabled={loading}
              className="px-3 py-2 rounded bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white"
            >
              Vernieuwen
            </button>
          </div>
        </div>

        {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
      </section>

      <section className="space-y-3">
        {loading && !rows.length ? (
          <p>Loading…</p>
        ) : !rows.length ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">Geen resultaten.</p>
        ) : (
          <div className="space-y-3">
            {grouped.map(([d, items]) => (
              <div
                key={d}
                className="border border-orange-200/60 dark:border-orange-500/30 rounded-lg p-3 bg-white/60 dark:bg-gray-900/40"
              >
                <div className="font-semibold text-gray-900 dark:text-gray-100">{d}</div>

                <div className="mt-2 space-y-2">
                  {items.map((r) => (
                    <div
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-t border-orange-500/10 pt-2"
                    >
                      <div className="text-sm text-gray-900 dark:text-gray-100">
                        <span className="font-semibold">{nameById.get(r.user_id) ?? r.user_id}</span>
                        <span className="mx-2 text-gray-400">•</span>
                        <span className={r.status === 'available' ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                          {r.status === 'available' ? 'Beschikbaar' : 'Niet beschikbaar'}
                        </span>
                        <span className="mx-2 text-gray-400">•</span>
                        <span>{displayTime(r.start_time)} – {displayTime(r.end_time)}</span>
                        {r.note ? <span className="mx-2 text-gray-400">•</span> : null}
                        {r.note ? <span className="text-gray-600 dark:text-gray-300">{r.note}</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
