'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import GoogleAgendaButton from '@/components/GoogleAgendaButton'

type CalendarEvent = {
  title: string
  start: string
  end: string
  location?: string | null
  isAllDay?: boolean
  source?: string
}

type ViewMode = 'month' | 'week'

type DayBucketItem = {
  event: CalendarEvent
  startsAt?: Date | null
  endsAt?: Date | null
  isAllDay: boolean
}

const WEEKDAYS_NL = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function toDateKey(d: Date) {
  const yyyy = d.getFullYear()
  const mm = pad2(d.getMonth() + 1)
  const dd = pad2(d.getDate())
  return `${yyyy}-${mm}-${dd}`
}

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function endOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

function addDays(d: Date, days: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + days)
  return x
}

function addMonths(d: Date, months: number) {
  const x = new Date(d)
  const day = x.getDate()
  x.setDate(1)
  x.setMonth(x.getMonth() + months)
  const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate()
  x.setDate(Math.min(day, last))
  return x
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

function startOfWeekMonday(d: Date) {
  const x = startOfDay(d)
  const jsDay = x.getDay() // 0..6 (Sun..Sat)
  const mondayIndex = (jsDay + 6) % 7 // 0=Mon..6=Sun
  return addDays(x, -mondayIndex)
}

function endOfWeekMonday(d: Date) {
  return endOfDay(addDays(startOfWeekMonday(d), 6))
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function formatMonthTitle(d: Date) {
  return d.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })
}

function formatWeekTitle(weekStart: Date) {
  const weekEnd = addDays(weekStart, 6)
  const startLabel = weekStart.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' })
  const endLabel = weekEnd.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short', year: 'numeric' })
  return `${startLabel} – ${endLabel}`
}

function formatTimeRange(item: DayBucketItem) {
  if (item.isAllDay) return 'Hele dag'
  if (!item.startsAt || !item.endsAt) return ''
  const sLabel = item.startsAt.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  const eLabel = item.endsAt.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  return `${sLabel} – ${eLabel}`
}

function toRfc3339Local(d: Date) {
  // RFC3339 with local timezone offset (prevents range shifts around midnight in EU timezones).
  const yyyy = d.getFullYear()
  const mm = pad2(d.getMonth() + 1)
  const dd = pad2(d.getDate())
  const hh = pad2(d.getHours())
  const mi = pad2(d.getMinutes())
  const ss = pad2(d.getSeconds())

  const offsetMin = -d.getTimezoneOffset() // minutes east of UTC
  const sign = offsetMin >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMin)
  const oh = pad2(Math.floor(abs / 60))
  const om = pad2(abs % 60)

  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}${sign}${oh}:${om}`
}

function normalizeEvents(list: any[]): CalendarEvent[] {
  return (list ?? [])
    .filter((e) => e && e.start && e.end)
    .map((e) => ({
      title: String(e.title ?? ''),
      start: String(e.start),
      end: String(e.end),
      location: e.location ?? null,
      isAllDay: Boolean((e as any).isAllDay),
      source: e.source ?? 'google',
    }))
}

function expandIntoDays(events: CalendarEvent[], rangeStart: Date, rangeEnd: Date) {
  const buckets = new Map<string, DayBucketItem[]>()

  const push = (dayKey: string, item: DayBucketItem) => {
    const list = buckets.get(dayKey)
    if (list) list.push(item)
    else buckets.set(dayKey, [item])
  }

  for (const ev of events) {
    const isAllDay = Boolean(ev.isAllDay)

    if (isAllDay && /^\d{4}-\d{2}-\d{2}$/.test(ev.start) && /^\d{4}-\d{2}-\d{2}$/.test(ev.end)) {
      const start = new Date(ev.start + 'T00:00:00')
      const endExclusive = new Date(ev.end + 'T00:00:00')
      // Google all-day end.date is exclusive
      for (let cur = startOfDay(start); cur.getTime() < endExclusive.getTime(); cur = addDays(cur, 1)) {
        if (cur.getTime() < rangeStart.getTime() || cur.getTime() > rangeEnd.getTime()) continue
        push(toDateKey(cur), { event: ev, isAllDay: true, startsAt: null, endsAt: null })
      }
      continue
    }

    const s = new Date(ev.start)
    const e = new Date(ev.end)
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) continue

    const startDay = startOfDay(s)
    const endDay = startOfDay(e)
    const daysSpan = Math.max(0, Math.round((endDay.getTime() - startDay.getTime()) / (24 * 60 * 60 * 1000)))
    const maxDays = Math.min(daysSpan, 31)

    for (let i = 0; i <= maxDays; i++) {
      const day = addDays(startDay, i)
      if (day.getTime() < rangeStart.getTime() || day.getTime() > rangeEnd.getTime()) continue

      const startsAt = i === 0 ? s : null
      const endsAt = i === maxDays ? e : null
      push(toDateKey(day), { event: ev, isAllDay: false, startsAt, endsAt })
    }
  }

  // Sort
  for (const [k, list] of buckets.entries()) {
    list.sort((a, b) => {
      if (a.isAllDay !== b.isAllDay) return a.isAllDay ? -1 : 1
      const aStart = a.startsAt?.getTime() ?? 0
      const bStart = b.startsAt?.getTime() ?? 0
      return aStart - bStart
    })
    buckets.set(k, list)
  }

  return buckets
}

export default function AgendaPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [loadingUser, setLoadingUser] = useState(true)

  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [anchorDate, setAnchorDate] = useState<Date>(() => new Date())
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null)

  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoadingUser(true)
      const { data } = await supabase.auth.getUser()
      setUserId(data.user?.id ?? null)
      setLoadingUser(false)
    }
    load()

    const { data } = supabase.auth.onAuthStateChange(() => {
      load()
    })

    return () => {
      data.subscription.unsubscribe()
    }
  }, [])

  const visibleRange = useMemo(() => {
    if (viewMode === 'week') {
      const weekStart = startOfWeekMonday(anchorDate)
      const weekEnd = endOfWeekMonday(anchorDate)
      return { start: startOfDay(weekStart), end: endOfDay(weekEnd) }
    }

    const monthStart = startOfMonth(anchorDate)
    const monthEnd = endOfMonth(anchorDate)
    const gridStart = startOfWeekMonday(monthStart)
    const gridEnd = endOfWeekMonday(monthEnd)
    return { start: startOfDay(gridStart), end: endOfDay(gridEnd) }
  }, [viewMode, anchorDate])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    const getAccessToken = async (): Promise<string | null> => {
      const { data } = await supabase.auth.getSession()
      if (data?.session?.access_token) return data.session.access_token
      const refreshed = await supabase.auth.refreshSession()
      if (refreshed.data?.session?.access_token) return refreshed.data.session.access_token

      if (typeof window !== 'undefined') {
        for (const k of Object.keys(localStorage)) {
          if (k.startsWith('sb-') && k.endsWith('-auth-token')) {
            try {
              const raw = localStorage.getItem(k)
              const parsed = raw ? JSON.parse(raw) : null
              if (parsed?.access_token) return parsed.access_token
            } catch {
              // ignore
            }
          }
        }
      }
      return null
    }

    const load = async () => {
      if (!userId) {
        setEvents([])
        setLoading(false)
        setError(null)
        return
      }

      setLoading(true)
      setError(null)

      try {
        const token = await getAccessToken()
        const headers: Record<string, string> = {}
        if (token) headers.Authorization = `Bearer ${token}`

        const timeMin = toRfc3339Local(startOfDay(visibleRange.start))
        const timeMax = toRfc3339Local(endOfDay(visibleRange.end))
        const params = new URLSearchParams({ timeMin, timeMax })

        const r = await fetch('/api/google/calendar?' + params.toString(), {
          credentials: 'include',
          cache: 'no-store',
          headers,
          signal: controller.signal,
        })

        const json = await r.json().catch(() => ({} as any))

        if (!r.ok) {
          const code = String(json?.error ?? '')
          if (code === 'google_not_connected') throw new Error('Google Agenda is nog niet gekoppeld.')
          if (code === 'not_authenticated') throw new Error('Niet ingelogd (sessie verlopen).')
          if (code === 'google_reconnect_required') {
            throw new Error('Google koppeling verlopen. Koppel opnieuw via de knop hieronder.')
          }
          throw new Error(code || 'Agenda laden mislukt')
        }

        const normalized = normalizeEvents(Array.isArray(json?.events) ? json.events : [])
        if (cancelled) return
        setEvents(normalized)
        setError(null)
      } catch (e: any) {
        if (cancelled) return
        if (String(e?.name ?? '') === 'AbortError') return
        setEvents([])
        setError(String(e?.message ?? 'Agenda laden mislukt'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      load()
    }

    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      controller.abort()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [userId, visibleRange.start, visibleRange.end])

  const dayBuckets = useMemo(() => expandIntoDays(events, visibleRange.start, visibleRange.end), [events, visibleRange])

  const today = useMemo(() => new Date(), [])
  const todayKey = toDateKey(today)

  const monthGridDays = useMemo(() => {
    const days: Date[] = []
    for (let d = new Date(visibleRange.start); d.getTime() <= visibleRange.end.getTime(); d = addDays(d, 1)) {
      days.push(d)
      if (days.length > 45) break
    }
    return days
  }, [visibleRange])

  const weekDays = useMemo(() => {
    const start = startOfWeekMonday(anchorDate)
    return Array.from({ length: 7 }, (_, i) => addDays(start, i))
  }, [anchorDate])

  const title = useMemo(() => {
    if (viewMode === 'week') return formatWeekTitle(startOfWeekMonday(anchorDate))
    return formatMonthTitle(anchorDate)
  }, [viewMode, anchorDate])

  return (
    <div className="min-h-[calc(100dvh-72px)]">
      <div className="max-w-6xl mx-auto p-3 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Agenda</h1>
            <div className="text-sm text-gray-600 dark:text-gray-400">Maand / week overzicht (Google Agenda)</div>
          </div>

          {!loadingUser && userId && (
            <div className="shrink-0">
              <GoogleAgendaButton userId={userId} />
            </div>
          )}
        </div>

        {!userId && !loadingUser && (
          <div className="mt-4 rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-gray-900/60 shadow-sm p-4">
            <div className="font-semibold">Niet ingelogd</div>
            <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              <Link href="/login" className="underline">Log in</Link> om je agenda te zien.
            </div>
          </div>
        )}

        <div className="mt-4 rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white/80 dark:bg-gray-900/60 shadow-sm backdrop-blur p-3 sm:p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-xl border border-gray-200/80 dark:border-gray-800 overflow-hidden bg-gray-50 dark:bg-gray-900">
                <button
                  type="button"
                  onClick={() => setViewMode('month')}
                  className={
                    'px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-black/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900 ' +
                    (viewMode === 'month'
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                      : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5')
                  }
                >
                  Maand
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('week')}
                  className={
                    'px-3 py-2 text-sm border-l border-gray-200/80 dark:border-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900 ' +
                    (viewMode === 'week'
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                      : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5')
                  }
                >
                  Week
                </button>
              </div>

              <button
                type="button"
                onClick={() => setAnchorDate(new Date())}
                className="text-sm px-3 py-2 rounded-xl border border-gray-200/80 dark:border-gray-800 bg-white/60 dark:bg-gray-900/30 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-black/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900"
              >
                Vandaag
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedDayKey(null)
                  setAnchorDate((d) => (viewMode === 'week' ? addDays(d, -7) : addMonths(d, -1)))
                }}
                className="text-sm px-3 py-2 rounded-xl border border-gray-200/80 dark:border-gray-800 bg-white/60 dark:bg-gray-900/30 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-black/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900"
                aria-label="Vorige"
                title="Vorige"
              >
                ←
              </button>
              <div className="text-sm sm:text-base font-semibold capitalize min-w-[180px] text-center">
                {title}
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedDayKey(null)
                  setAnchorDate((d) => (viewMode === 'week' ? addDays(d, 7) : addMonths(d, 1)))
                }}
                className="text-sm px-3 py-2 rounded-xl border border-gray-200/80 dark:border-gray-800 bg-white/60 dark:bg-gray-900/30 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-black/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900"
                aria-label="Volgende"
                title="Volgende"
              >
                →
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-3 rounded-xl border border-red-200/80 dark:border-red-800 bg-red-50/70 dark:bg-red-500/10 p-3">
              <div className="text-sm text-red-700 dark:text-red-300">{error}</div>
              {userId && <div className="mt-2"><GoogleAgendaButton userId={userId} /></div>}
            </div>
          )}
        </div>

        <div className="mt-4">
          {loading ? (
            <div className="rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white/80 dark:bg-gray-900/60 shadow-sm p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400">Agenda laden…</div>
            </div>
          ) : viewMode === 'month' ? (
            <div className="rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white/80 dark:bg-gray-900/60 shadow-sm overflow-hidden">
              <div className="grid grid-cols-7 border-b border-gray-200/80 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/80">
                {WEEKDAYS_NL.map((d) => (
                  <div key={d} className="px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-400">
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7">
                {monthGridDays.map((day) => {
                  const key = toDateKey(day)
                  const inMonth = day.getMonth() === anchorDate.getMonth()
                  const isToday = key === todayKey
                  const items = dayBuckets.get(key) ?? []
                  const maxShow = 3
                  const shown = items.slice(0, maxShow)
                  const extra = Math.max(0, items.length - maxShow)

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedDayKey(key)}
                      className={
                        'min-h-[112px] sm:min-h-[128px] text-left px-2 sm:px-3 py-2 border-r border-b border-gray-200/80 dark:border-gray-800 hover:bg-gray-100/70 dark:hover:bg-white/5 transition ' +
                        (!inMonth ? 'opacity-50 ' : '') +
                        (isToday ? 'bg-orange-50/60 dark:bg-orange-500/10 ' : '')
                      }
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div
                          className={
                            'text-xs font-semibold rounded px-2 py-1 ' +
                            (isToday
                              ? 'bg-orange-600 text-white'
                              : 'bg-gray-100 text-gray-800 dark:bg-white/10 dark:text-gray-100')
                          }
                        >
                          {day.getDate()}
                        </div>
                        {items.length > 0 && <div className="text-[10px] text-gray-500 dark:text-gray-400">{items.length}</div>}
                      </div>

                      <div className="mt-2 space-y-1">
                        {shown.map((it, idx) => {
                          const label = it.isAllDay ? 'Hele dag' : (it.startsAt ? it.startsAt.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : '…')
                          return (
                            <div
                              key={key + '-' + idx}
                              className={
                                'rounded-lg px-2 py-1 text-[11px] border truncate ' +
                                (it.isAllDay
                                  ? 'bg-orange-50 text-orange-900 border-orange-200/80 dark:bg-orange-500/10 dark:text-orange-100 dark:border-orange-500/30'
                                  : 'bg-white/70 dark:bg-black/20 border-gray-200/80 dark:border-gray-800')
                              }
                              title={it.event.title}
                            >
                              <span className="text-gray-600 dark:text-gray-400 mr-1">{label}</span>
                              <span className="font-semibold">{it.event.title || '(zonder titel)'}</span>
                            </div>
                          )
                        })}
                        {extra > 0 && <div className="text-[11px] text-gray-600 dark:text-gray-400">+{extra} meer</div>}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white/80 dark:bg-gray-900/60 shadow-sm overflow-hidden">
              <div className="grid grid-cols-7 border-b border-gray-200/80 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/80">
                {weekDays.map((d) => {
                  const key = toDateKey(d)
                  const isToday = isSameDay(d, today)
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedDayKey(key)}
                      className={
                        'px-2 sm:px-3 py-2 text-left hover:bg-gray-100/70 dark:hover:bg-white/5 border-r border-gray-200/80 dark:border-gray-800 last:border-r-0 ' +
                        (isToday ? 'bg-orange-50/60 dark:bg-orange-500/10' : '')
                      }
                    >
                      <div className="text-xs text-gray-600 dark:text-gray-400">{WEEKDAYS_NL[(d.getDay() + 6) % 7]}</div>
                      <div className="text-sm font-semibold">
                        {d.getDate()}/{pad2(d.getMonth() + 1)}
                      </div>
                    </button>
                  )
                })}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-7">
                {weekDays.map((d) => {
                  const key = toDateKey(d)
                  const items = dayBuckets.get(key) ?? []

                  return (
                    <div key={key} className="border-r border-gray-200/80 dark:border-gray-800 last:border-r-0">
                      <div className="p-3">
                        {items.length === 0 ? (
                          <div className="text-xs text-gray-500 dark:text-gray-400">Geen events</div>
                        ) : (
                          <div className="space-y-2">
                            {items.map((it, idx) => (
                              <div
                                key={key + '-' + idx}
                                className={
                                  'rounded-xl border px-3 py-2 ' +
                                  (it.isAllDay
                                    ? 'bg-orange-50 text-orange-900 border-orange-200/80 dark:bg-orange-500/10 dark:text-orange-100 dark:border-orange-500/30'
                                    : 'bg-white/60 dark:bg-black/20 border-gray-200/80 dark:border-gray-800')
                                }
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="text-xs text-gray-600 dark:text-gray-400">{formatTimeRange(it)}</div>
                                    <div className="text-sm font-semibold truncate">{it.event.title || '(zonder titel)'}</div>
                                    {it.event.location && <div className="text-xs text-gray-600 dark:text-gray-400 truncate mt-1">{it.event.location}</div>}
                                  </div>
                                  <div className="text-[10px] text-gray-500 dark:text-gray-400 shrink-0">{String(it.event.source ?? 'google')}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {selectedDayKey && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedDayKey(null)} />
            <div className="absolute left-1/2 top-1/2 w-[92vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-2xl">
              <div className="p-4 border-b border-gray-200/80 dark:border-gray-800 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Dag</div>
                  <div className="font-semibold capitalize">
                    {new Date(selectedDayKey + 'T00:00:00').toLocaleDateString('nl-NL', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDayKey(null)}
                  className="text-sm px-3 py-2 rounded-xl border border-gray-200/80 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-black/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900"
                >
                  Sluiten
                </button>
              </div>

              <div className="p-4 max-h-[70dvh] overflow-auto">
                {(dayBuckets.get(selectedDayKey) ?? []).length === 0 ? (
                  <div className="text-sm text-gray-600 dark:text-gray-400">Geen events op deze dag.</div>
                ) : (
                  <div className="space-y-2">
                    {(dayBuckets.get(selectedDayKey) ?? []).map((it, idx) => (
                      <div
                        key={selectedDayKey + '-' + idx}
                        className={
                          'rounded-xl border px-3 py-3 ' +
                          (it.isAllDay
                            ? 'bg-orange-50 text-orange-900 border-orange-200/80 dark:bg-orange-500/10 dark:text-orange-100 dark:border-orange-500/30'
                            : 'bg-white/60 dark:bg-black/20 border-gray-200/80 dark:border-gray-800')
                        }
                      >
                        <div className="text-xs text-gray-600 dark:text-gray-400">{formatTimeRange(it)}</div>
                        <div className="text-sm font-semibold mt-1">{it.event.title || '(zonder titel)'}</div>
                        {it.event.location && <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">{it.event.location}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
