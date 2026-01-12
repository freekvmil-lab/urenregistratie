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

  useEffect(() => {
    if (!userId) return // 🔴 CRUCIAAL

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
  }, [userId]) // 🔴 OOK CRUCIAAL

  if (!userId) {
    return <p>Gebruiker laden…</p>
  }

  if (loading) {
    return <p>Uren laden…</p>
  }

  return (
    <div className="mt-4 space-y-2">
      <h2 className="font-bold">Mijn entries</h2>

      {entries.length === 0 ? (
        <p>Geen entries gevonden</p>
      ) : (
        entries.map((e) => (
          <div key={e.id} className="border p-2 rounded">
            <div>{e.date}</div>
            <div>
              {new Date(e.start_time).toLocaleTimeString('nl-NL')} –{' '}
              {e.end_time
                ? new Date(e.end_time).toLocaleTimeString('nl-NL')
                : 'bezig'}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
