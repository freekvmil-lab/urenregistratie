'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

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

const todayYmd = () => ymd(new Date())

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

export default function AvailabilityPage() {
  const [ready, setReady] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()))

  // We treat availability as "exceptions": by default available.
  // We only store all-day rows with status='unavailable'.
  const [unavailableRows, setUnavailableRows] = useState<AvailabilityRow[]>([])
  const [loading, setLoading] = useState(false)
  const [savingDay, setSavingDay] = useState<Record<string, boolean>>({})

  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadUser = async () => {
    setMessage(null)
    setError(null)

    const { data: auth } = await supabase.auth.getUser()
    const u = auth.user

    setUserId(u?.id ?? null)
    setReady(true)
  }

  const loadMonth = async (uid: string, targetMonth: Date) => {
    setLoading(true)
    setError(null)

    const from = ymd(startOfMonth(targetMonth))
    const to = ymd(endOfMonth(targetMonth))

    try {
      const { data, error: loadErr } = await supabase
        .from('availability')
        .select('id, user_id, date, start_time, end_time, status, note')
        .eq('user_id', uid)
        .gte('date', from)
        .lte('date', to)
        .eq('status', 'unavailable')
        .is('start_time', null)
        .is('end_time', null)
        .order('date', { ascending: true })

      if (loadErr) {
        const msg = String(loadErr.message || 'Laden mislukt')
        if (msg.toLowerCase().includes('relation') && msg.toLowerCase().includes('availability')) {
          setError('Tabel availability bestaat nog niet. Run eerst availability.sql in Supabase.')
        } else {
          setError(msg)
        }
        setUnavailableRows([])
        return
      }

      setUnavailableRows((data ?? []) as AvailabilityRow[])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUser()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadUser()
    })

    return () => subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!userId) return
    loadMonth(userId, month)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, month.getFullYear(), month.getMonth()])

  const unavailableByDate = useMemo(() => {
    const m = new Map<string, AvailabilityRow>()
    for (const r of unavailableRows) m.set(r.date, r)
    return m
  }, [unavailableRows])

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

  const toggleUnavailable = async (dayYmd: string) => {
    if (!userId) return
    if (savingDay[dayYmd]) return

    setMessage(null)
    setError(null)
    setSavingDay((p) => ({ ...p, [dayYmd]: true }))

    const existing = unavailableByDate.get(dayYmd)

    // optimistic
    if (existing) {
      setUnavailableRows((prev) => prev.filter((r) => r.id !== existing.id))
    } else {
      // temporary row (no id yet)
      const temp: AvailabilityRow = {
        id: -Math.floor(Math.random() * 1_000_000_000),
        user_id: userId,
        date: dayYmd,
        start_time: null,
        end_time: null,
        status: 'unavailable',
        note: null,
      }
      setUnavailableRows((prev) => [...prev, temp].sort((a, b) => a.date.localeCompare(b.date)))
    }

    try {
      if (existing) {
        const { error: delErr } = await supabase
          .from('availability')
          .delete()
          .eq('id', existing.id)

        if (delErr) {
          setError(delErr.message || 'Opslaan mislukt')
          await loadMonth(userId, month)
          return
        }
      } else {
        const { data, error: insErr } = await supabase
          .from('availability')
          .insert({
            user_id: userId,
            date: dayYmd,
            start_time: null,
            end_time: null,
            status: 'unavailable',
            note: null,
          })
          .select('id, user_id, date, start_time, end_time, status, note')

        if (insErr) {
          setError(insErr.message || 'Opslaan mislukt')
          await loadMonth(userId, month)
          return
        }

        const created = (Array.isArray(data) ? data[0] : null) as AvailabilityRow | null
        if (created?.id) {
          // replace temp with real id by reloading month (simple & safe)
          await loadMonth(userId, month)
        }
      }
    } finally {
      setSavingDay((p) => {
        const next = { ...p }
        delete next[dayYmd]
        return next
      })
    }
  }

  const clearMonth = async () => {
    if (!userId) return
    const ok = confirm('Alle rood gemarkeerde dagen in deze maand weer beschikbaar maken?')
    if (!ok) return

    setMessage(null)
    setError(null)
    setLoading(true)
    try {
      const from = ymd(startOfMonth(month))
      const to = ymd(endOfMonth(month))

      const { error: delErr } = await supabase
        .from('availability')
        .delete()
        .eq('user_id', userId)
        .gte('date', from)
        .lte('date', to)
        .eq('status', 'unavailable')
        .is('start_time', null)
        .is('end_time', null)

      if (delErr) {
        setError(delErr.message || 'Reset mislukt')
        return
      }

      await loadMonth(userId, month)
      setMessage('Maand is weer volledig beschikbaar.')
    } finally {
      setLoading(false)
    }
  }

  if (!ready) {
    return (
      <main className="px-4 py-4 sm:p-6">
        <p>Loading…</p>
      </main>
    )
  }

  if (!userId) {
    return (
      <main className="px-4 py-4 sm:p-6 space-y-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Beschikbaarheid</h1>
        <p>Je bent niet ingelogd.</p>
        <a href="/login" className="inline-block border border-orange-500/60 hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10 px-3 py-2 rounded">
          Inloggen
        </a>
      </main>
    )
  }

  return (
    <main className="px-4 py-4 sm:p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Beschikbaarheid</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Klik op een dag om hem <span className="font-semibold text-red-600">niet beschikbaar</span> te maken (rood). Nog een keer klikken maakt hem weer groen.
        </p>
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
              onClick={() => setMonth(startOfMonth(new Date()))}
              className="px-3 py-2 rounded border border-orange-500/60 hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10"
            >
              Vandaag
            </button>
            <button
              onClick={clearMonth}
              disabled={loading}
              className="px-3 py-2 rounded border border-orange-500/60 hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10 disabled:opacity-50"
            >
              Maak maand beschikbaar
            </button>
          </div>
        </div>

        {error && <div className="text-sm text-red-600">{error}</div>}
        {message && <div className="text-sm text-orange-700 dark:text-orange-300">{message}</div>}

        <div className="grid grid-cols-7 gap-1.5 sm:gap-2 text-xs text-gray-600 dark:text-gray-300">
          {['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'].map((d) => (
            <div key={d} className="text-center font-semibold">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {gridDates.map((d) => {
            const dayYmd = ymd(d)
            const inMonth = d.getMonth() === month.getMonth()
            const isUnavailable = unavailableByDate.has(dayYmd)
            const busy = Boolean(savingDay[dayYmd])

            const base =
              'aspect-square rounded-lg border flex items-start justify-end p-1.5 sm:p-2 text-xs sm:text-sm select-none transition-colors '

            const cls =
              base +
              (inMonth
                ? isUnavailable
                  ? 'bg-red-600 text-white border-red-700'
                  : 'bg-green-600 text-white border-green-700'
                : 'bg-gray-200/60 dark:bg-gray-800/60 text-gray-500 border-gray-300/60 dark:border-gray-700/60 opacity-50') +
              (busy ? ' opacity-70' : '')

            return (
              <button
                key={dayYmd}
                type="button"
                disabled={!inMonth || busy || loading}
                onClick={() => toggleUnavailable(dayYmd)}
                className={cls}
                title={inMonth ? (isUnavailable ? 'Niet beschikbaar (klik om beschikbaar te maken)' : 'Beschikbaar (klik om niet beschikbaar te maken)') : ''}
              >
                {d.getDate()}
              </button>
            )
          })}
        </div>

        <div className="text-xs text-gray-500 dark:text-gray-400 flex flex-wrap gap-3">
          <span className="inline-flex items-center gap-2"><span className="inline-block w-3 h-3 rounded bg-green-600" /> Beschikbaar</span>
          <span className="inline-flex items-center gap-2"><span className="inline-block w-3 h-3 rounded bg-red-600" /> Niet beschikbaar</span>
          <span className="inline-flex items-center gap-2"><span className="inline-block w-3 h-3 rounded bg-gray-300 dark:bg-gray-700" /> Buiten maand</span>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Niet beschikbaar (deze maand)</h2>
        {loading && !unavailableRows.length ? (
          <p>Loading…</p>
        ) : !unavailableRows.length ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">Geen rood gemarkeerde dagen.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {unavailableRows.map((r) => (
              <button
                key={r.id}
                onClick={() => toggleUnavailable(r.date)}
                disabled={Boolean(savingDay[r.date]) || loading}
                className="px-2 py-1 rounded bg-red-600 text-white text-sm disabled:opacity-50"
                title="Klik om weer beschikbaar te maken"
              >
                {r.date}
              </button>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
