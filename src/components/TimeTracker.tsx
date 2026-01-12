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
     FETCH ACTIVE ENTRY
     (NO maybeSingle!)
  ======================= */

  const fetchActive = async () => {
    if (!userId) return
    setLoading(true)

    const { data, error } = await supabase
      .from('time_entries')
      .select('id, user_id, start_time, end_time, date')
      .eq('user_id', userId)
      .is('end_time', null)
      .order('start_time', { ascending: false })
      .limit(1)

    if (error) {
      console.error('fetchActive error:', error)
      setEntry(null)
      setWorkedHours(null)
      setLoading(false)
      return
    }

    const active = data && data.length > 0 ? data[0] : null
    setEntry(active)

    if (active?.end_time) {
      const start = new Date(active.start_time).getTime()
      const end = new Date(active.end_time).getTime()
      setWorkedHours(
        Math.round(((end - start) / 3600000) * 100) / 100
      )
    } else {
      setWorkedHours(null)
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchActive()
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
        ) : activeEntry ? (
          <p>Je bent momenteel aan het werk</p>
        ) : (
          <p>Je bent momenteel niet aan het werk</p>
        )}
      </div>

      <WorkButton
        userId={userId}
        activeEntry={activeEntry}
        onUpdate={fetchActive}
      />
    </div>
  )
}
