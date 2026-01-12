'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Entry {
  id: number
  user_id: string
  date: string
  start_time: string
  end_time: string | null
}

export default function MyOverview({ userId }: { userId?: string }) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(false)

  /* =======================
     CURRENT WEEK (maandag)
  ======================= */

  const [currentWeek, setCurrentWeek] = useState<Date>(() => {
    const d = new Date()
    const day = d.getDay() || 7
    d.setDate(d.getDate() - day + 1)
    d.setHours(0, 0, 0, 0)
    return d
  })

  /* =======================
     FETCH ENTRIES
  ======================= */

  useEffect(() => {
    if (!userId) return

    const fetchEntries = async () => {
      setLoading(true)

      const { data, error } = await supabase
        .from('time_entries')
        .select('id, user_id, date, start_time, end_time')
        .eq('user_id', userId)
        .order('start_time', { ascending: false })

      if (error) {
        console.error('fetchEntries error:', error)
        setEntries([])
      } else {
        setEntries(data ?? [])
      }

      setLoading(false)
    }

    fetchEntries()
  }, [userId])

  if (!userId) return <p>Gebruiker laden…</p>
  if (loading) return <p>Uren laden…</p>

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

  const grouped = weekEntries.reduce<
    Record<string, Entry[]>
  >((acc, e) => {
    acc[e.date] = acc[e.date] || []
    acc[e.date].push(e)
    return acc
  }, {})

  const weekTotal = weekEntries.reduce((sum, e) => {
    if (!e.end_time) return sum
    return (
      sum +
      (new Date(e.end_time).getTime() -
        new Date(e.start_time).getTime()) /
        3600000
    )
  }, 0)

  /* =======================
     RENDER
  ======================= */

  return (
    <div className="mt-6 space-y-4">
      {/* WEEK NAV */}
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

      {Object.keys(grouped).length === 0 ? (
        <p>Geen uren in deze week</p>
      ) : (
        Object.entries(grouped).map(
          ([date, list]) => (
            <div
              key={date}
              className="border rounded p-3 space-y-1"
            >
              <div className="font-medium">
                {new Date(date).toLocaleDateString(
                  'nl-NL',
                  {
                    weekday: 'short',
                    day: '2-digit',
                    month: 'short',
                  }
                )}
              </div>

              {list.map((e) => (
                <div
                  key={e.id}
                  className="text-sm"
                >
                  {new Date(
                    e.start_time
                  ).toLocaleTimeString('nl-NL', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  –{' '}
                  {e.end_time
                    ? new Date(
                        e.end_time
                      ).toLocaleTimeString(
                        'nl-NL',
                        {
                          hour: '2-digit',
                          minute: '2-digit',
                        }
                      )
                    : 'bezig'}
                </div>
              ))}
            </div>
          )
        )
      )}
    </div>
  )
}
