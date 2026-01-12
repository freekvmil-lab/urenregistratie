'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Entry {
  id: number
  user_id: string
  date: string
  start_time: string
  end_time: string | null
  edited?: boolean
  approved?: boolean
  manual?: boolean
}

export default function MyOverview({ userId }: { userId: string }) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)

  /* =======================
     WEEK STATE (altijd huidige week)
  ======================= */

  const [currentWeek, setCurrentWeek] = useState<Date>(() => {
    const d = new Date()
    const day = d.getDay() || 7
    d.setDate(d.getDate() - day + 1) // maandag
    d.setHours(0, 0, 0, 0)
    return d
  })

  /* =======================
     FETCH ENTRIES
  ======================= */

  const fetchMyEntries = async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('time_entries')
      .select(
        'id, user_id, date, start_time, end_time, edited, approved, manual'
      )
      .eq('user_id', userId)
      .order('start_time', { ascending: false })
      .limit(60)

    if (error) {
      console.error('fetchMyEntries error:', error)
      setEntries([])
    } else {
      setEntries(data ?? [])
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchMyEntries()
  }, [userId])

  /* =======================
     HELPERS
  ======================= */

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('nl-NL', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    })

  const formatTime = (date: string | null) => {
    if (!date) return ''
    return new Date(date).toLocaleTimeString('nl-NL', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const calculateHours = (start: string, end: string | null) => {
    if (!end) return 0
    return (
      (new Date(end).getTime() -
        new Date(start).getTime()) /
      3600000
    )
  }

  /* =======================
     ACTIVE ENTRY (altijd tonen)
  ======================= */

  const activeEntry = entries.find(
    (e) => e.end_time === null
  )

  /* =======================
     WEEK FILTER
  ======================= */

  const weekStart = new Date(currentWeek)
  const weekEnd = new Date(currentWeek)
  weekEnd.setDate(weekEnd.getDate() + 6)
  weekEnd.setHours(23, 59, 59, 999)

  const weekEntries = entries.filter((e) => {
    const d = new Date(e.date)
    return d >= weekStart && d <= weekEnd
  })

  const groupedWeek = weekEntries.reduce<
    Record<string, Entry[]>
  >((acc, e) => {
    acc[e.date] = acc[e.date] || []
    acc[e.date].push(e)
    return acc
  }, {})

  const weekTotal = weekEntries.reduce(
    (sum, e) =>
      sum + calculateHours(e.start_time, e.end_time),
    0
  )

  if (loading) return <p>Overzicht laden…</p>

  /* =======================
     RENDER
  ======================= */

  return (
    <div className="mt-6 space-y-6">
      {/* ACTIEVE ENTRY (altijd zichtbaar) */}
      {activeEntry && (
        <div className="p-4 border rounded bg-yellow-50 text-black">
          <strong>Je bent momenteel aan het werk</strong>
          <div className="text-sm">
            Gestart om{' '}
            {formatTime(activeEntry.start_time)}
          </div>
        </div>
      )}

      {/* WEEK NAVIGATIE */}
      <div className="flex justify-between items-center">
        <button
          onClick={() =>
            setCurrentWeek(
              new Date(
                currentWeek.setDate(
                  currentWeek.getDate() - 7
                )
              )
            )
          }
        >
          ← Vorige
        </button>

        <strong>
          Week van{' '}
          {weekStart.toLocaleDateString('nl-NL')}
        </strong>

        <button
          onClick={() =>
            setCurrentWeek(
              new Date(
                currentWeek.setDate(
                  currentWeek.getDate() + 7
                )
              )
            )
          }
        >
          Volgende →
        </button>
      </div>

      <p className="font-bold">
        Totaal: {weekTotal.toFixed(2)} uur
      </p>

      {/* WEEK OVERVIEW */}
      {Object.keys(groupedWeek).length === 0 ? (
        <p>Geen uren in deze week</p>
      ) : (
        Object.entries(groupedWeek).map(
          ([date, list]) => (
            <div
              key={date}
              className="border rounded p-3 space-y-2"
            >
              <div className="flex justify-between font-medium">
                <span>{formatDate(date)}</span>
                <span>
                  {list
                    .reduce(
                      (s, e) =>
                        s +
                        calculateHours(
                          e.start_time,
                          e.end_time
                        ),
                      0
                    )
                    .toFixed(2)}{' '}
                  uur
                </span>
              </div>

              {list.map((e) => (
                <div
                  key={e.id}
                  className="text-sm flex justify-between border-t pt-1"
                >
                  <span>
                    {formatTime(e.start_time)} –{' '}
                    {formatTime(e.end_time) ||
                      'bezig'}
                  </span>

                  {e.manual && (
                    <span className="text-xs text-gray-500">
                      handmatig
                    </span>
                  )}
                </div>
              ))}
            </div>
          )
        )
      )}
    </div>
  )
}
