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

function toDateKey(d: Date) {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function formatDayHeader(dateKey: string) {
  const d = new Date(dateKey + 'T00:00:00')
  return d.toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function formatTimeRange(ev: CalendarEvent) {
  if (ev.isAllDay) return 'Hele dag'
  const s = new Date(ev.start)
  const e = new Date(ev.end)
  const sLabel = s.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  const eLabel = e.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  return `${sLabel} – ${eLabel}`
}

export default function AgendaPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [loadingUser, setLoadingUser] = useState(true)

  const [daysAhead, setDaysAhead] = useState<number>(14)
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

  useEffect(() => {
    let cancelled = false

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

        const params = new URLSearchParams({
          daysBack: '1',
          daysAhead: String(daysAhead),
        })

        const r = await fetch('/api/google/calendar?' + params.toString(), {
          credentials: 'include',
          cache: 'no-store',
          headers,
        })

        const json = await r.json().catch(() => ({} as any))

        if (!r.ok) {
          const code = String(json?.error ?? '')
          if (code === 'google_not_connected') {
            throw new Error('Google Agenda is nog niet gekoppeld.')
          }
          if (code === 'not_authenticated') {
            throw new Error('Niet ingelogd (sessie verlopen).')
          }
          if (code === 'google_reconnect_required') {
            throw new Error('Google koppeling verlopen. Koppel opnieuw via de knop hieronder.')
          }
          throw new Error(code || 'Agenda laden mislukt')
        }

        const list = Array.isArray(json?.events) ? (json.events as CalendarEvent[]) : []

        // Normalize
        const normalized = list
          .filter((e) => e && e.start && e.end)
          .map((e) => ({
            title: String(e.title ?? ''),
            start: String(e.start),
            end: String(e.end),
            location: e.location ?? null,
            isAllDay: Boolean((e as any).isAllDay),
            source: e.source ?? 'google',
          }))

        if (cancelled) return
        setEvents(normalized)
        setError(null)
      } catch (e: any) {
        if (cancelled) return
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
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [userId, daysAhead])

  const grouped = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()

    for (const ev of events) {
      const d = new Date(ev.isAllDay ? ev.start + 'T00:00:00' : ev.start)
      const key = toDateKey(d)
      const list = map.get(key)
      if (list) list.push(ev)
      else map.set(key, [ev])
    }

    // Sort keys and events
    const keys = Array.from(map.keys()).sort((a, b) => a.localeCompare(b))
    const todayKey = toDateKey(new Date())

    for (const k of keys) {
      const list = map.get(k) ?? []
      list.sort((a, b) => {
        const aAll = Boolean(a.isAllDay)
        const bAll = Boolean(b.isAllDay)
        if (aAll !== bAll) return aAll ? -1 : 1
        return String(a.start).localeCompare(String(b.start))
      })
      map.set(k, list)
    }

    return { map, keys, todayKey }
  }, [events])

  return (
    <div className="max-w-5xl mx-auto p-3 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Agenda</h1>
          <div className="text-sm opacity-70">Google Agenda van werknemers (jouw account)</div>
        </div>

        {!loadingUser && userId && (
          <div className="shrink-0">
            <GoogleAgendaButton userId={userId} />
          </div>
        )}
      </div>

      <div className="mt-4 rounded border border-orange-200/60 dark:border-orange-500/30 bg-white dark:bg-black/30 p-3 sm:p-4">
        {!userId && !loadingUser ? (
          <div className="text-sm">
            <div className="font-semibold">Niet ingelogd</div>
            <div className="opacity-80 mt-1">
              <Link href="/login" className="underline">Log in</Link> om je agenda te zien.
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm">
              <div className="font-semibold">Periode</div>
              <div className="opacity-80">Van gisteren t/m {daysAhead} dagen vooruit</div>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={daysAhead}
                onChange={(e) => setDaysAhead(Number(e.target.value))}
                className="text-sm px-3 py-2 rounded border border-orange-200/60 dark:border-orange-500/30 bg-white dark:bg-black/20"
              >
                <option value={7}>7 dagen</option>
                <option value={14}>14 dagen</option>
                <option value={30}>30 dagen</option>
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="text-sm opacity-70">Agenda laden…</div>
        ) : error ? (
          <div className="rounded border border-orange-200/60 dark:border-orange-500/30 bg-white dark:bg-black/30 p-4">
            <div className="text-sm text-red-700 dark:text-red-300">{error}</div>
            {userId && (
              <div className="mt-3">
                <GoogleAgendaButton userId={userId} />
              </div>
            )}
          </div>
        ) : events.length === 0 ? (
          <div className="rounded border border-orange-200/60 dark:border-orange-500/30 bg-white dark:bg-black/30 p-4">
            <div className="font-semibold">Geen events</div>
            <div className="text-sm opacity-80 mt-1">Er staan geen agenda-items in deze periode.</div>
          </div>
        ) : (
          <div className="space-y-3">
            {grouped.keys.map((dayKey) => {
              const list = grouped.map.get(dayKey) ?? []
              const isToday = dayKey === grouped.todayKey

              return (
                <div
                  key={dayKey}
                  className={
                    'rounded border p-3 sm:p-4 ' +
                    (isToday
                      ? 'border-orange-300/80 dark:border-orange-500/40 bg-orange-50/70 dark:bg-orange-500/10'
                      : 'border-orange-200/60 dark:border-orange-500/30 bg-white dark:bg-black/30')
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold capitalize">{formatDayHeader(dayKey)}</div>
                    {isToday && <div className="text-xs opacity-70">Vandaag</div>}
                  </div>

                  <div className="mt-3 space-y-2">
                    {list.map((ev, idx) => (
                      <div
                        key={dayKey + '-' + idx}
                        className="rounded border border-orange-200/60 dark:border-orange-500/20 bg-white/60 dark:bg-black/20 px-3 py-2"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold truncate">{ev.title || '(zonder titel)'}</div>
                            <div className="text-xs opacity-70 mt-1">
                              {formatTimeRange(ev)}
                              {ev.location ? ` · ${ev.location}` : ''}
                            </div>
                          </div>
                          <div className="text-[10px] opacity-60 shrink-0">{String(ev.source ?? 'google')}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
