'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Entry = {
  id: number
  date: string
  start_time: string | null
  end_time: string | null
}

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)
const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0)

const ymd = (d: Date) => d.toISOString().slice(0, 10)

const hoursBetween = (start: string | null, end: string | null) => {
  if (!start || !end) return 0
  return (new Date(end).getTime() - new Date(start).getTime()) / 3600000
}

export default function MonthOverview({ userId }: { userId: string }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(false)
  const [hourlyRate, setHourlyRate] = useState<number | ''>('')

  const range = useMemo(() => {
    const start = startOfMonth(month)
    const end = endOfMonth(month)
    return { start, end }
  }, [month])

  const monthLabel = useMemo(
    () =>
      month.toLocaleDateString('nl-NL', {
        month: 'long',
        year: 'numeric',
      }),
    [month]
  )

  const load = async () => {
    if (!userId) return
    setLoading(true)

    const { data, error } = await supabase
      .from('time_entries')
      .select('id, date, start_time, end_time')
      .eq('user_id', userId)
      .gte('date', ymd(range.start))
      .lte('date', ymd(range.end))
      .order('date', { ascending: true })

    if (error) {
      console.error('MonthOverview load error:', error)
      setEntries([])
      setLoading(false)
      return
    }

    setEntries((data ?? []) as Entry[])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, range.start.getTime(), range.end.getTime()])

  useEffect(() => {
    // user-scoped key so rates don't clash across accounts on same device
    const key = `hourly_rate_${userId}`
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null
    if (raw) {
      const parsed = Number(raw)
      if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
        setHourlyRate(parsed)
      }
    }
  }, [userId])

  const byDay = useMemo(() => {
    const m = new Map<string, { hours: number; count: number }>()
    for (const e of entries) {
      const key = e.date
      const prev = m.get(key) ?? { hours: 0, count: 0 }
      m.set(key, {
        hours: prev.hours + hoursBetween(e.start_time, e.end_time),
        count: prev.count + 1,
      })
    }
    return m
  }, [entries])

  const monthTotal = useMemo(() => {
    let total = 0
    for (const v of byDay.values()) total += v.hours
    return total
  }, [byDay])

  const earnings = useMemo(() => {
    const rate = typeof hourlyRate === 'number' ? hourlyRate : null
    if (!rate) return null
    return monthTotal * rate
  }, [monthTotal, hourlyRate])

  const days = useMemo(() => {
    const first = startOfMonth(month)
    const last = endOfMonth(month)

    // Monday-based calendar: 1..7 (Mon..Sun)
    const firstDow = ((first.getDay() + 6) % 7) // 0=Mon

    const gridStart = new Date(first)
    gridStart.setDate(first.getDate() - firstDow)

    const grid: { date: Date; inMonth: boolean }[] = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart)
      d.setDate(gridStart.getDate() + i)
      grid.push({
        date: d,
        inMonth: d >= first && d <= last,
      })
    }
    return grid
  }, [month])

  const openManualForDate = (d: Date) => {
    const ev = new CustomEvent('openManual', { detail: { date: ymd(d) } })
    window.dispatchEvent(ev)
  }

  const saveRate = () => {
    const key = `hourly_rate_${userId}`
    if (typeof hourlyRate === 'number' && Number.isFinite(hourlyRate)) {
      window.localStorage.setItem(key, String(hourlyRate))
    } else {
      window.localStorage.removeItem(key)
    }
  }

  return (
    <section className="bg-black/30 border border-gray-700 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
            className="px-2 py-1 border border-gray-600 rounded"
            aria-label="Vorige maand"
          >
            ←
          </button>
          <strong className="capitalize">{monthLabel}</strong>
          <button
            onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
            className="px-2 py-1 border border-gray-600 rounded"
            aria-label="Volgende maand"
          >
            →
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => openManualForDate(new Date())}
            className="border border-gray-600 px-3 py-1 rounded"
          >
            ➕ Handmatig toevoegen
          </button>

          <div className="text-right">
            <div className="text-sm text-gray-200 font-semibold">
              {loading ? 'Laden…' : `Totaal: ${monthTotal.toFixed(2)} uur`}
            </div>
            <div className="text-xs text-gray-400">
              {earnings != null
                ? `Schatting: ${earnings.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' })}`
                : 'Verdiensten: stel uurtarief in'}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <label className="text-gray-300">Uurtarief (€)</label>
        <input
          value={hourlyRate}
          onChange={(e) => {
            const v = e.target.value
            if (v === '') {
              setHourlyRate('')
              return
            }
            const n = Number(v)
            if (Number.isFinite(n)) setHourlyRate(n)
          }}
          inputMode="decimal"
          className="w-24 px-2 py-1 rounded bg-gray-800 border border-gray-700"
          placeholder="bijv. 20"
        />
        <button
          onClick={saveRate}
          className="px-2 py-1 rounded bg-gray-900 text-white border border-gray-700"
        >
          Opslaan
        </button>
        <button
          onClick={() => {
            setHourlyRate('')
            const key = `hourly_rate_${userId}`
            window.localStorage.removeItem(key)
          }}
          className="px-2 py-1 rounded border border-gray-700"
        >
          Wissen
        </button>
      </div>

      <div className="grid grid-cols-7 text-xs text-gray-400">
        {['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'].map((d) => (
          <div key={d} className="px-2 py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {days.map(({ date, inMonth }) => {
          const key = ymd(date)
          const info = byDay.get(key)
          const isToday = key === ymd(new Date())

          return (
            <button
              key={key}
              onClick={() => openManualForDate(date)}
              className={
                'text-left rounded border p-2 min-h-[64px] transition ' +
                (inMonth
                  ? 'border-gray-700 bg-black/20 hover:bg-black/30'
                  : 'border-transparent bg-transparent opacity-40') +
                (isToday ? ' ring-1 ring-blue-500' : '')
              }
              disabled={!inMonth}
              title={inMonth ? 'Klik om handmatig toe te voegen' : undefined}
            >
              <div className="flex items-start justify-between">
                <div className={inMonth ? 'text-gray-100' : 'text-gray-400'}>
                  {date.getDate()}
                </div>
                {info?.count ? (
                  <div className="text-[10px] text-gray-400">{info.count}x</div>
                ) : null}
              </div>

              {info?.hours ? (
                <div className="mt-1 text-sm font-semibold text-gray-100">
                  {info.hours.toFixed(2)}u
                </div>
              ) : (
                <div className="mt-1 text-[11px] text-gray-500">—</div>
              )}
            </button>
          )
        })}
      </div>

      <div className="text-xs text-gray-400">
        Tip: klik op een dag om “Handmatig toevoegen” te openen.
      </div>
    </section>
  )
}
