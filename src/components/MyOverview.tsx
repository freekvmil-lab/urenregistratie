'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Entry {
  id: number
  date: string
  start_time: string
  end_time: string | null
}

export default function MyOverview({ userId }: { userId: string }) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchMyEntries = async () => {
      setLoading(true)

      const { data, error } = await supabase
        .from('time_entries')
        .select('id, date, start_time, end_time')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(14)

      if (!error && data) {
        setEntries(data)
      }

      setLoading(false)
    }

    fetchMyEntries()
  }, [userId])

  const calculateHours = (start: string, end: string | null) => {
    if (!end) return ''
    return (
      (new Date(end).getTime() - new Date(start).getTime()) / 3600000
    ).toFixed(2)
  }

  const today = new Date().toISOString().slice(0, 10)

  const todayEntry = entries.find((e) => e.date === today)

  const weekTotal = entries.reduce((total, e) => {
    if (!e.end_time) return total
    return total + Number(calculateHours(e.start_time, e.end_time))
  }, 0)

  if (loading) return <p>Overzicht laden…</p>

  return (
    <div className="mt-6 space-y-6">
      {/* Vandaag */}
      <div className="p-4 rounded border">
        <h2 className="font-semibold mb-2">Vandaag</h2>
        {todayEntry ? (
          <p>
            {todayEntry.start_time.slice(11, 16)} –{' '}
            {todayEntry.end_time
              ? todayEntry.end_time.slice(11, 16)
              : 'bezig'}
          </p>
        ) : (
          <p>Geen uren vandaag</p>
        )}
      </div>

      {/* Week totaal */}
      <div className="p-4 rounded border">
        <h2 className="font-semibold mb-2">Laatste dagen</h2>
        <p className="text-lg font-bold">
          {weekTotal.toFixed(1)} uur
        </p>
      </div>

      {/* Historie */}
      <div className="p-4 rounded border">
        <h2 className="font-semibold mb-2">Mijn uren</h2>

        {entries.length === 0 ? (
          <p>Geen entries</p>
        ) : (
          <ul className="divide-y">
            {entries.map((e) => (
              <li key={e.id} className="py-2 flex justify-between">
                <span>{e.date}</span>
                <span>
                  {e.start_time.slice(11, 16)} –{' '}
                  {e.end_time
                    ? e.end_time.slice(11, 16)
                    : 'bezig'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
