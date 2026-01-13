'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Entry = {
  id: number
  date: string
  start_time: string | null
  end_time: string | null
  client?: string | null
}

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)
const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0)

const ymd = (d: Date) => {
  // IMPORTANT: use local date parts (not UTC via toISOString)
  // to avoid off-by-one day when clicking calendar cells.
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const hoursBetween = (start: string | null, end: string | null) => {
  if (!start || !end) return 0
  return (new Date(end).getTime() - new Date(start).getTime()) / 3600000
}

export default function MonthOverview({ userId }: { userId: string }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(false)
  const [hourlyRate, setHourlyRate] = useState<number | null>(null)
  const [rateLoading, setRateLoading] = useState(false)

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
      .select('id, date, start_time, end_time, client')
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
    const loadRate = async () => {
      if (!userId) return
      setRateLoading(true)
      const { data, error } = await supabase
        .from('profiles')
        .select('hourly_rate')
        .eq('id', userId)
        .single()

      if (error) {
        console.warn('MonthOverview hourly_rate load error:', error)
        setHourlyRate(null)
      } else {
        const rate = (data as any)?.hourly_rate
        setHourlyRate(typeof rate === 'number' ? rate : rate == null ? null : Number(rate))
      }
      setRateLoading(false)
    }

    loadRate()
  }, [userId])

  const byDay = useMemo(() => {
    const m = new Map<
      string,
      { hours: number; count: number; perClient: Map<string, number> }
    >()
    for (const e of entries) {
      const key = e.date
      const prev = m.get(key) ?? {
        hours: 0,
        count: 0,
        perClient: new Map<string, number>(),
      }

      const clientNameRaw = (e.client ?? '').trim()
      const clientName = clientNameRaw.length > 0 ? clientNameRaw : '—'
      const entryHours = hoursBetween(e.start_time, e.end_time)
      prev.perClient.set(
        clientName,
        (prev.perClient.get(clientName) ?? 0) + entryHours
      )

      m.set(key, {
        hours: prev.hours + entryHours,
        count: prev.count + 1,
        perClient: prev.perClient,
      })
    }
    return m
  }, [entries])

  const clientSummary = (info: { perClient: Map<string, number> }) => {
    const pairs = Array.from(info.perClient.entries())
      .filter(([name, hrs]) => name && hrs > 0)
      .sort((a, b) => b[1] - a[1])

    if (pairs.length === 0) return null

    const top = pairs.slice(0, 2)
    const more = pairs.length - top.length

    const label = top
      .map(([name, hrs]) => `${name} ${hrs.toFixed(1)}u`)
      .join(' • ')

    return more > 0 ? `${label} • +${more}` : label
  }

  const monthTotal = useMemo(() => {
    let total = 0
    for (const v of byDay.values()) total += v.hours
    return total
  }, [byDay])

  const earnings = useMemo(() => {
    if (hourlyRate == null) return null
    if (!Number.isFinite(hourlyRate)) return null
    return monthTotal * hourlyRate
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

        <div className="text-right">
          <div className="text-sm text-gray-200 font-semibold">
            {loading ? 'Laden…' : `Totaal: ${monthTotal.toFixed(2)} uur`}
          </div>
          <div className="text-xs text-gray-400">
            {earnings != null
              ? `Schatting: ${earnings.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' })}`
              : rateLoading
                ? 'Uurtarief laden…'
                : 'Verdiensten: uurtarief nog niet ingesteld'}
          </div>
          <div className="text-[11px] text-gray-500">
            {rateLoading
              ? '—'
              : hourlyRate == null
                ? 'Uurtarief: —'
                : `Uurtarief: ${hourlyRate.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' })} / uur`}
          </div>
        </div>
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
          const summary = info ? clientSummary(info) : null

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

              {summary ? (
                <div className="mt-1 text-[10px] leading-snug text-gray-400 line-clamp-2">
                  {summary}
                </div>
              ) : null}
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
