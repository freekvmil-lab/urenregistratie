'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AgendaSuggestions from '@/components/AgendaSuggestions'

/* =======================
   TYPES
======================= */

interface Entry {
  id: number
  user_id: string
  date: string
  start_time: string
  end_time: string | null
  edited?: boolean
  approved?: boolean
  manual?: boolean
  client?: string | null
  location?: string | null
  kilometers?: number | null
  parking_paid?: boolean | null
  parking_cost?: number | null
}

/* =======================
   HELPERS
======================= */

const canEdit = (date: string) => {
  const diff =
    (Date.now() - new Date(date).getTime()) /
    (1000 * 60 * 60 * 24)
  return diff <= 3
}

const toLocalISOString = (date: string, time: string) => {
  const [h, m] = time.split(':').map(Number)
  const d = new Date(date)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString('nl-NL', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  })

const formatTime = (d: string | null) =>
  d
    ? new Date(d).toLocaleTimeString('nl-NL', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'

const hours = (s: string, e: string | null) =>
  e ? (new Date(e).getTime() - new Date(s).getTime()) / 3600000 : 0

/* =======================
   COMPONENT
======================= */

export default function MyOverview({ userId }: { userId?: string }) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)

  /* ===== VIEW ===== */
  const [currentWeek, setCurrentWeek] = useState(() => {
    const d = new Date()
    const day = d.getDay() || 7
    d.setDate(d.getDate() - day + 1)
    d.setHours(0, 0, 0, 0)
    return d
  })

  /* ===== EDIT ===== */
  const [editing, setEditing] = useState<Entry | null>(null)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  /* ===== MANUAL ===== */
  const [manual, setManual] = useState(false)
  const [manualDate, setManualDate] = useState('')
  const [manualStart, setManualStart] = useState('')
  const [manualEnd, setManualEnd] = useState('')
  const [client, setClient] = useState('')
  const [location, setLocation] = useState('')

  /* =======================
     FETCH
  ======================= */

  const fetchEntries = async () => {
    if (!userId) return
    setLoading(true)

    const { data } = await supabase
      .from('time_entries')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })

    if (data) setEntries(data)
    setLoading(false)
  }

  useEffect(() => {
    fetchEntries()
  }, [userId])

  /* =======================
     FILTERS
  ======================= */

  const weekStart = new Date(currentWeek)
  const weekEnd = new Date(currentWeek)
  weekEnd.setDate(weekEnd.getDate() + 6)

  const weekEntries = entries.filter((e) => {
    const d = new Date(e.date)
    return d >= weekStart && d <= weekEnd
  })

  const grouped = weekEntries.reduce<Record<string, Entry[]>>(
    (acc, e) => {
      acc[e.date] = acc[e.date] || []
      acc[e.date].push(e)
      return acc
    },
    {}
  )

  const weekTotal = weekEntries.reduce(
    (s, e) => s + hours(e.start_time, e.end_time),
    0
  )

  /* =======================
     ACTIONS
  ======================= */

  const openEdit = (e: Entry) => {
    setEditing(e)
    setStart(e.start_time.slice(11, 16))
    setEnd(e.end_time ? e.end_time.slice(11, 16) : '')
  }

  const saveEdit = async () => {
    if (!editing) return

    await supabase.from('time_entries').update({
      start_time: toLocalISOString(editing.date, start),
      end_time: toLocalISOString(editing.date, end),
      edited: true,
      approved: false,
    }).eq('id', editing.id)

    setEditing(null)
    fetchEntries()
  }

  const saveManual = async () => {
    await supabase.from('time_entries').insert({
      user_id: userId,
      date: manualDate,
      start_time: toLocalISOString(manualDate, manualStart),
      end_time: toLocalISOString(manualDate, manualEnd),
      manual: true,
      edited: true,
      approved: false,
      client,
      location,
    })

    setManual(false)
    fetchEntries()
  }

  /* =======================
     RENDER
  ======================= */

  if (!userId) return <p>Gebruiker laden…</p>
  if (loading) return <p>Overzicht laden…</p>

  return (
    <div className="mt-6 space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <button onClick={() =>
          setCurrentWeek(new Date(currentWeek.setDate(currentWeek.getDate() - 7)))
        }>
          ← Vorige
        </button>

        <strong>
          Week van {weekStart.toLocaleDateString('nl-NL')}
        </strong>

        <button onClick={() =>
          setCurrentWeek(new Date(currentWeek.setDate(currentWeek.getDate() + 7)))
        }>
          Volgende →
        </button>
      </div>

      <p className="font-bold">
        Totaal: {weekTotal.toFixed(2)} uur
      </p>

      {/* AGENDA */}
      <AgendaSuggestions
        onUse={(e) => {
          setManual(true)
          const s = new Date(e.start)
          const en = new Date(e.end)
          setManualDate(s.toISOString().slice(0, 10))
          setManualStart(s.toISOString().slice(11, 16))
          setManualEnd(en.toISOString().slice(11, 16))
          setClient(e.title)
          setLocation(e.location ?? '')
        }}
      />

      {/* DAYS */}
      {Object.entries(grouped).map(([date, list]) => (
        <div
          key={date}
          className="border border-gray-700 rounded-lg p-4 bg-black/30"
        >
          <div className="flex justify-between font-medium mb-2">
            <span>{formatDate(date)}</span>
            <span>
              {list.reduce(
                (s, e) => s + hours(e.start_time, e.end_time),
                0
              ).toFixed(2)} uur
            </span>
          </div>

          {list.map((e) => (
            <div
              key={e.id}
              className="flex justify-between text-sm py-1 border-t border-gray-700"
            >
              <span>
                {formatTime(e.start_time)} – {formatTime(e.end_time)}
              </span>

              {canEdit(e.date) && !e.approved && (
                <button
                  onClick={() => openEdit(e)}
                  className="text-blue-500"
                >
                  ✏️
                </button>
              )}
            </div>
          ))}
        </div>
      ))}

      {/* EDIT MODAL */}
      {editing && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-900 p-6 rounded-lg space-y-3 w-80">
            <h3 className="font-semibold">Uren aanpassen</h3>

            <input
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 px-2 py-1 rounded"
            />

            <input
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 px-2 py-1 rounded"
            />

            <div className="flex justify-end gap-2">
              <button onClick={() => setEditing(null)}>
                Annuleren
              </button>
              <button
                onClick={saveEdit}
                className="bg-white text-black px-3 py-1 rounded"
              >
                Opslaan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MANUAL MODAL */}
      {manual && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-900 p-6 rounded-lg space-y-3 w-80">
            <h3 className="font-semibold">
              Uren handmatig invoeren
            </h3>

            <input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} />
            <input type="time" value={manualStart} onChange={(e) => setManualStart(e.target.value)} />
            <input type="time" value={manualEnd} onChange={(e) => setManualEnd(e.target.value)} />

            <input
              placeholder="Opdrachtgever"
              value={client}
              onChange={(e) => setClient(e.target.value)}
            />

            <input
              placeholder="Locatie"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />

            <div className="flex justify-end gap-2">
              <button onClick={() => setManual(false)}>
                Annuleren
              </button>
              <button
                onClick={saveManual}
                className="bg-white text-black px-3 py-1 rounded"
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
