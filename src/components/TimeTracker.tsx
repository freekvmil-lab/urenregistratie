'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase' // gebruik relatief pad op Windows

interface TimeEntry {
  id: number
  user_id: string
  start_time: string
  end_time: string | null
  date: string
}

export default function TimeTracker({ userId }: { userId: string }) {
  const [entry, setEntry] = useState<TimeEntry | null>(null)
  const [loading, setLoading] = useState(false)
  const [workedHours, setWorkedHours] = useState<number | null>(null)

  // Fetch laatste entry van vandaag
  const fetchToday = async () => {
    if (!userId) return

    const today = new Date().toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('time_entries')
      .select('*')
      .eq('user_id', userId)
      .eq('date', today)
      .order('id', { ascending: false })
      .limit(1)
      .single()

    if (error) {
      console.error('fetchToday error:', error)
      setEntry(null)
      setWorkedHours(null)
      return
    }

    if (data) {
      setEntry(data as TimeEntry)

      if (data.end_time) {
        const start = new Date(data.start_time).getTime()
        const end = new Date(data.end_time).getTime()
        setWorkedHours(Math.round(((end - start) / 3600000) * 100) / 100)
      } else {
        setWorkedHours(null)
      }
    } else {
      setEntry(null)
      setWorkedHours(null)
    }
  }

  useEffect(() => {
    fetchToday()
  }, [userId])

  // Start werkdag
  const startWork = async () => {
    if (!userId) return
    setLoading(true)

    const today = new Date().toISOString().split('T')[0]
    console.log('Inserting work entry', { userId, today })

    const { error } = await supabase.from('time_entries').insert({
      user_id: userId,
      start_time: new Date().toISOString(),
      date: today,
    })

    if (error) console.error('Start werkdag error:', error)
    else console.log('Start werkdag success!')

    await fetchToday()
    setLoading(false)
  }

  // Stop werkdag
  const stopWork = async () => {
    if (!entry) return
    setLoading(true)
    console.log('Stopping work entry', entry.id)

    const { error } = await supabase
      .from('time_entries')
      .update({ end_time: new Date().toISOString() })
      .eq('id', entry.id)

    if (error) console.error('Stop werkdag error:', error)
    else console.log('Stop werkdag success!')

    await fetchToday()
    setLoading(false)
  }

  return (
    <div className="space-y-4 p-4 border rounded shadow max-w-sm">
      <h2 className="text-xl font-bold">Vandaag</h2>

      {entry ? (
        entry.end_time ? (
          <p>Gewerkte uren: {workedHours} uur</p>
        ) : (
          <p>Je bent nog aan het werk</p>
        )
      ) : (
        <p>Je bent nog niet begonnen</p>
      )}

      <button
        onClick={entry ? stopWork : startWork}
        disabled={loading}
        className="rounded bg-black text-white px-4 py-2 w-full"
      >
        {entry ? (entry.end_time ? 'Werkdag voltooid' : 'Stop werkdag') : 'Start werkdag'}
      </button>
    </div>
  )
}
