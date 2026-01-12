'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import WorkButton from '@/components/WorkButton'

interface TimeEntry {
  id: number
  user_id: string
  start_time: string
  end_time: string | null
  date: string
}

export default function TimeTracker({ userId }: { userId: string }) {
  const [entry, setEntry] = useState<TimeEntry | null>(null)
  const [workedHours, setWorkedHours] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  /* =======================
     FETCH TODAY (timezone safe)
  ======================= */

  const fetchToday = async () => {
    console.log('userId from app:', userId)
    if (!userId) return

    setLoading(true)

    // 🔒 lokale dag (niet UTC!)
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)

    const endOfDay = new Date()
    endOfDay.setHours(23, 59, 59, 999)

    const { data, error } = await supabase
      .from('time_entries')
      .select('id, user_id, start_time, end_time, date')
      .eq('user_id', userId)
      .gte('start_time', startOfDay.toISOString())
      .lte('start_time', endOfDay.toISOString())
      .order('start_time', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('fetchToday error:', error)
      setEntry(null)
      setWorkedHours(null)
      setLoading(false)
      return
    }

    if (!data) {
      setEntry(null)
      setWorkedHours(null)
      setLoading(false)
      return
    }

    setEntry(data)

    if (data.end_time) {
      const start = new Date(data.start_time).getTime()
      const end = new Date(data.end_time).getTime()
      const hours =
        Math.round(((end - start) / 3600000) * 100) / 100
      setWorkedHours(hours)
    } else {
      setWorkedHours(null)
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchToday()
  }, [userId])

  /* =======================
     ACTIVE ENTRY
  ======================= */

  const activeEntry =
    entry && !entry.end_time
      ? { id: entry.id, start_time: entry.start_time }
      : null

  /* =======================
     RENDER
  ======================= */

  return (
    <div className="relative mt-4">
      <div className="p-4 border rounded max-w-sm">
        <h2 className="text-xl font-bold mb-2">Vandaag</h2>

        {loading ? (
          <p>Status laden…</p>
        ) : entry ? (
          entry.end_time ? (
            <p>Gewerkte uren: {workedHours} uur</p>
          ) : (
            <p>Je bent momenteel aan het werk</p>
          )
        ) : (
          <p>Je bent vandaag nog niet begonnen</p>
        )}
      </div>

      {/* Floating Start / Stop Button */}
      <WorkButton
        userId={userId}
        activeEntry={activeEntry}
        onUpdate={fetchToday}
      />
    </div>
  )
}
