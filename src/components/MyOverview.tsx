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

const canEdit = (date: string) => {
  const entryDate = new Date(date)
  const today = new Date()
  const diffDays =
    (today.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24)

  return diffDays <= 3
}

export default function MyOverview({ userId }: { userId: string }) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)

  // ✏️ edit state
  const [editing, setEditing] = useState<Entry | null>(null)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  /* =======================
     FETCH ENTRIES
  ======================= */
  useEffect(() => {
    const fetchMyEntries = async () => {
      setLoading(true)

      const { data, error } = await supabase
        .from('time_entries')
        .select('id, user_id, date, start_time, end_time')
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

  /* =======================
     HELPERS
  ======================= */
  const calculateHours = (start: string, end: string | null) => {
    if (!end) return ''
    return (
      (new Date(end).getTime() - new Date(start).getTime()) / 3600000
    ).toFixed(2)
  }

  const openEdit = (entry: Entry) => {
    setEditing(entry)
    setStart(entry.start_time.slice(11, 16))
    setEnd(entry.end_time ? entry.end_time.slice(11, 16) : '')
  }

  const saveEdit = async () => {
    if (!editing) return

    const startDateTime = `${editing.date}T${start}:00`
    const endDateTime = `${editing.date}T${end}:00`

    await supabase
      .from('time_entries')
      .update({
        start_time: startDateTime,
        end_time: endDateTime,
        edited: true,
        edited_at: new Date().toISOString(),
        edited_by: userId,
      })
      .eq('id', editing.id)

    setEditing(null)
    window.location.reload()
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

      {/* Totaal */}
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
              <li
                key={e.id}
                className="py-2 flex justify-between items-center"
              >
                <span>{e.date}</span>

                <div className="flex items-center gap-2">
                  <span>
                    {e.start_time.slice(11, 16)} –{' '}
                    {e.end_time
                      ? e.end_time.slice(11, 16)
                      : 'bezig'}
                  </span>

                  {canEdit(e.date) && (
                    <button
                      onClick={() => openEdit(e)}
                      className="text-blue-600"
                    >
                      ✏️
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* MODAL */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
          <div className="bg-white p-4 rounded w-80 space-y-4">
            <h3 className="font-semibold">Uren aanpassen</h3>

            <label className="block">
              Start
              <input
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="border w-full p-1"
              />
            </label>

            <label className="block">
              Stop
              <input
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="border w-full p-1"
              />
            </label>

            <div className="flex justify-end gap-2">
              <button onClick={() => setEditing(null)}>
                Annuleren
              </button>
              <button
                onClick={saveEdit}
                className="bg-black text-white px-3 py-1 rounded"
              >
                Opslaan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
