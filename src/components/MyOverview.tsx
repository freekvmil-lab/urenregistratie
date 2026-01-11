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

  const fetchMyEntries = async () => {
    setLoading(true)

    const { data } = await supabase
      .from('time_entries')
      .select(
        'id, user_id, date, start_time, end_time, edited, approved'
      )
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(21)

    if (data) setEntries(data)

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
      (new Date(end).getTime() - new Date(start).getTime()) / 3600000
    )
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
        approved: false,
        edited_at: new Date().toISOString(),
        edited_by: userId,
      })
      .eq('id', editing.id)

    setEditing(null)
    fetchMyEntries()
  }

  /* =======================
     GROUP BY DAY
  ======================= */

  const grouped = entries.reduce<Record<string, Entry[]>>((acc, e) => {
    acc[e.date] = acc[e.date] || []
    acc[e.date].push(e)
    return acc
  }, {})

  if (loading) return <p>Overzicht laden…</p>

  return (
    <div className="mt-6 space-y-6">
      {/* Overzicht per dag */}
      <div className="p-4 rounded border bg-white dark:bg-gray-800">
        <h2 className="font-semibold mb-3">Mijn uren</h2>

        {Object.keys(grouped).length === 0 ? (
          <p>Geen entries</p>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([date, dayEntries]) => {
              const total = dayEntries.reduce(
                (sum, e) =>
                  sum + calculateHours(e.start_time, e.end_time),
                0
              )

              return (
                <div
                  key={date}
                  className="border rounded p-3 bg-gray-50 dark:bg-gray-700"
                >
                  <div className="flex justify-between font-medium mb-1">
                    <span>{formatDate(date)}</span>
                    <span>{total.toFixed(2)} uur</span>
                  </div>

                  {dayEntries.map((e) => (
                    <div
                      key={e.id}
                      className="flex justify-between items-center text-sm"
                    >
                      <span>
                        {formatTime(e.start_time)} –{' '}
                        {formatTime(e.end_time)}
                      </span>

                      <div className="flex items-center gap-2">
                        {e.edited && !e.approved && (
                          <span className="text-orange-500 text-xs">
                            Wacht op goedkeuring
                          </span>
                        )}

                        {e.approved && (
                          <span className="text-green-600 text-xs">
                            Goedgekeurd
                          </span>
                        )}

                        {canEdit(e.date) && !e.approved && (
                          <button
                            onClick={() => openEdit(e)}
                            className="text-blue-600 text-sm"
                          >
                            ✏️
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* MODAL */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 p-4 rounded w-80 space-y-4">
            <h3 className="font-semibold">Uren aanpassen</h3>

            <label className="block text-sm">
              Start
              <input
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="border w-full p-1 bg-white dark:bg-gray-700"
              />
            </label>

            <label className="block text-sm">
              Stop
              <input
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="border w-full p-1 bg-white dark:bg-gray-700"
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
