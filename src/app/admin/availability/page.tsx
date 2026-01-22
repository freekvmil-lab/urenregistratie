'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAdminGuard } from '@/lib/useAdminGuard'

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

const ymd = (d: Date) => {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)
const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0)

// Monday = 0
const mondayIndex = (d: Date) => (d.getDay() + 6) % 7

const startOfCalendarGrid = (month: Date) => {
  const first = startOfMonth(month)
  const idx = mondayIndex(first)
  const start = new Date(first)
  start.setDate(first.getDate() - idx)
  start.setHours(0, 0, 0, 0)
  return start
}

const addMonths = (d: Date, delta: number) => new Date(d.getFullYear(), d.getMonth() + delta, 1)

const monthLabel = (d: Date) =>
  d.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })

const todayYmd = () => {
  return ymd(new Date())
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
  const { allowed } = useAdminGuard()

  const [users, setUsers] = useState<Profile[]>([])
  const [rows, setRows] = useState<AvailabilityRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedUser, setSelectedUser] = useState<string>('all')
  const [from, setFrom] = useState(() => addDaysYmd(todayYmd(), -14))
  const [to, setTo] = useState(() => addDaysYmd(todayYmd(), 28))

  // Mini month overview (fast day drill-down)
  // Data model: default is available; we only store all-day rows with status='unavailable'.
  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()))
  const [selectedDay, setSelectedDay] = useState<string>(() => todayYmd())
  const [monthRows, setMonthRows] = useState<AvailabilityRow[]>([])
  const [monthLoading, setMonthLoading] = useState(false)
  const [monthError, setMonthError] = useState<string | null>(null)

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

  const loadMonthOverview = async () => {
    if (!allowed) return

    setMonthLoading(true)
    setMonthError(null)

    try {
      const monthFrom = ymd(startOfMonth(month))
      const monthTo = ymd(endOfMonth(month))

      let q = supabase
        .from('availability')
        .select('id, user_id, date, start_time, end_time, status, note')
        .gte('date', monthFrom)
        .lte('date', monthTo)
        .eq('status', 'unavailable')
        .is('start_time', null)
        .is('end_time', null)
        .order('date', { ascending: true })

      if (selectedUser !== 'all') q = q.eq('user_id', selectedUser)

      const { data, error } = await q

      if (error) {
        const msg = String(error.message || 'Laden mislukt')
        if (msg.toLowerCase().includes('relation') && msg.toLowerCase().includes('availability')) {
          setMonthError('Tabel availability bestaat nog niet. Run eerst availability.sql in Supabase.')
        } else {
          setMonthError(msg)
        }
        setMonthRows([])
        return
      }

      setMonthRows((data ?? []) as AvailabilityRow[])
    } finally {
      setMonthLoading(false)
    }
  }

  useEffect(() => {
    if (allowed) {
      loadUsers()
      loadAvailability()
      loadMonthOverview()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed])

  useEffect(() => {
    if (allowed) loadAvailability()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUser, from, to])

  useEffect(() => {
    if (allowed) loadMonthOverview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, selectedUser, month.getFullYear(), month.getMonth()])

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

  const unavailableByDate = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const r of monthRows) {
      const key = r.date
      const set = m.get(key) ?? new Set<string>()
      set.add(r.user_id)
      m.set(key, set)
    }
    return m
  }, [monthRows])

  const gridDates = useMemo(() => {
    const start = startOfCalendarGrid(month)
    const days: Date[] = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      days.push(d)
    }
    return days
  }, [month])

  const dayDetails = useMemo(() => {
    const unavailableIds = unavailableByDate.get(selectedDay) ?? new Set<string>()

    if (selectedUser !== 'all') {
      const u = users.find((x) => x.id === selectedUser)
      const isUnavailable = unavailableIds.has(selectedUser)
      return {
        mode: 'single' as const,
        user: u ?? { id: selectedUser, name: selectedUser },
        isUnavailable,
      }
    }

    const unavailableUsers = users.filter((u) => unavailableIds.has(u.id))
    const availableUsers = users.filter((u) => !unavailableIds.has(u.id))
    return {
      mode: 'all' as const,
      unavailableUsers,
      availableUsers,
    }
  }, [unavailableByDate, selectedDay, selectedUser, users])

  if (allowed === null) return <p>Controleren…</p>
  if (!allowed) return <p>Geen toegang</p>

  return (
    <main className="px-4 py-4 sm:p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Beschikbaarheid (admin)</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300">Overzicht voor alle werknemers.</p>
      </header>

      <section className="border border-orange-200/60 dark:border-orange-500/30 rounded-lg p-4 bg-white/60 dark:bg-gray-900/40 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMonth((m) => addMonths(m, -1))}
              className="px-3 py-2 rounded border border-orange-500/60 hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10"
              aria-label="Vorige maand"
            >
              ←
            </button>
            <div className="font-semibold text-gray-900 dark:text-gray-100 capitalize">{monthLabel(month)}</div>
            <button
              onClick={() => setMonth((m) => addMonths(m, 1))}
              className="px-3 py-2 rounded border border-orange-500/60 hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10"
              aria-label="Volgende maand"
            >
              →
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setMonth(startOfMonth(new Date()))
                setSelectedDay(todayYmd())
              }}
              className="px-3 py-2 rounded border border-orange-500/60 hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10"
            >
              Vandaag
            </button>
            <button
              onClick={loadMonthOverview}
              disabled={monthLoading}
              className="px-3 py-2 rounded bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white"
            >
              Vernieuwen
            </button>
          </div>
        </div>

        {monthError && <div className="text-sm text-red-600">{monthError}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
          <div>
            <div className="grid grid-cols-7 gap-2 text-xs text-gray-600 dark:text-gray-300">
              {['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'].map((d) => (
                <div key={d} className="text-center font-semibold">{d}</div>
              ))}
            </div>

            <div className="mt-2 grid grid-cols-7 gap-2">
              {gridDates.map((d) => {
                const dayYmd = ymd(d)
                const inMonth = d.getMonth() === month.getMonth()
                const isSelected = selectedDay === dayYmd

                const unavailableCount = (unavailableByDate.get(dayYmd)?.size ?? 0)
                const total = selectedUser === 'all' ? users.length : 1

                const base =
                  'aspect-square rounded-lg border p-2 text-sm select-none transition-colors flex flex-col justify-between '

                const cls =
                  base +
                  (inMonth
                    ? isSelected
                      ? 'border-orange-500 bg-orange-50 dark:bg-orange-500/10'
                      : 'border-orange-200/60 dark:border-orange-500/30 bg-white/60 dark:bg-gray-900/40 hover:bg-orange-50 dark:hover:bg-orange-500/10'
                    : 'border-gray-300/60 dark:border-gray-700/60 bg-gray-200/60 dark:bg-gray-800/60 opacity-50')

                return (
                  <button
                    key={dayYmd}
                    type="button"
                    onClick={() => setSelectedDay(dayYmd)}
                    className={cls}
                    title="Klik om details te bekijken"
                    disabled={monthLoading}
                  >
                    <div className="text-right font-semibold text-gray-900 dark:text-gray-100">{d.getDate()}</div>
                    {inMonth && (
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-gray-600 dark:text-gray-300">{total ? `${total - unavailableCount}/${total}` : '—'}</span>
                        {unavailableCount > 0 ? (
                          <span className="px-1.5 py-0.5 rounded bg-red-600 text-white">
                            {unavailableCount}
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-green-600 text-white">0</span>
                        )}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>

            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Badge: aantal <span className="text-red-600 font-semibold">niet beschikbaar</span>.
            </div>
          </div>

          <div className="border border-orange-200/60 dark:border-orange-500/30 rounded-lg p-3 bg-white/60 dark:bg-gray-900/40">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold text-gray-900 dark:text-gray-100">{selectedDay}</div>
              {monthLoading && <div className="text-xs text-gray-500">Loading…</div>}
            </div>

            {dayDetails.mode === 'single' ? (
              <div className="mt-3 text-sm">
                <div className="font-semibold text-gray-900 dark:text-gray-100">
                  {dayDetails.user.name ?? 'Onbekend'}
                </div>
                <div className={dayDetails.isUnavailable ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'}>
                  {dayDetails.isUnavailable ? 'Niet beschikbaar' : 'Beschikbaar'}
                </div>
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-semibold text-green-700 dark:text-green-400">Beschikbaar</div>
                  {dayDetails.availableUsers.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {dayDetails.availableUsers.map((u) => (
                        <span key={u.id} className="px-2 py-1 rounded bg-green-600 text-white text-sm">
                          {u.name ?? 'Onbekend'}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">Niemand</div>
                  )}
                </div>

                <div>
                  <div className="text-sm font-semibold text-red-700 dark:text-red-400">Niet beschikbaar</div>
                  {dayDetails.unavailableUsers.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {dayDetails.unavailableUsers.map((u) => (
                        <span key={u.id} className="px-2 py-1 rounded bg-red-600 text-white text-sm">
                          {u.name ?? 'Onbekend'}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">Niemand</div>
                  )}
                </div>
              </div>
            )}

            <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              Let op: default is beschikbaar; alleen rood wordt opgeslagen.
            </div>
          </div>
        </div>
      </section>

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
