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

const canEdit = (date: string) =>
  (Date.now() - new Date(date).getTime()) /
    (1000 * 60 * 60 * 24) <= 3

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

  const openEdit = (e: Entry) => {
    setEditing(e)
    setStart(e.start_time.slice(11, 16))
    setEnd(e.end_time ? e.end_time.slice(11, 16) : '')
    setClient(e.client ?? '')
    setLocation(e.location ?? '')
  }

  const saveEdit = async () => {
    if (!editing) return
    await supabase.from('time_entries').update({
      start_time: toLocalISOString(editing.date, start),
      end_time: toLocalISOString(editing.date, end),
      client: client || null,
      location: location || null,
      edited: true,
      approved: false,
    }).eq('id', editing.id)

    setEditing(null)
    fetchEntries()
  }

  const saveManual = async () => {
    if (!userId) return
    await supabase.from('time_entries').insert({
      user_id: userId,
      date: manualDate,
      start_time: toLocalISOString(manualDate, manualStart),
      end_time: toLocalISOString(manualDate, manualEnd),
      manual: true,
      edited: true,
      approved: false,
      client: client || null,
      location: location || null,
    })

    setManual(false)
    fetchEntries()
  }

  if (!userId) return <p>Gebruiker laden…</p>
  if (loading) return <p>Overzicht laden…</p>

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
     RENDER
  ======================= */

  return (
    <div className="mt-6 space-y-6">
      {/* HEADER */}
      <div className="flex justify-between items-center">
        <button
          onClick={() =>
            setCurrentWeek(
              new Date(currentWeek.setDate(currentWeek.getDate() - 7))
            )
          }
        >
          ← Vorige
        </button>

        <strong>
          Week van {weekStart.toLocaleDateString('nl-NL')}
        </strong>

        <button
          onClick={() =>
            setCurrentWeek(
              new Date(currentWeek.setDate(currentWeek.getDate() + 7))
            )
          }
        >
          Volgende →
        </button>
      </div>

      <p className="font-bold">
        Totaal: {weekTotal.toFixed(2)} uur
      </p>

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
      {Object.entries(grouped).map(([date, list]) => {
        const dayTotal = list.reduce(
          (s, e) => s + hours(e.start_time, e.end_time),
          0
        )

        return (
          <div
            key={date}
            className="bg-black/30 border border-gray-700 rounded-lg p-4 space-y-3"
          >
            <div className="flex justify-between font-medium">
              <span>{formatDate(date)}</span>
              <span>{dayTotal.toFixed(2)} uur</span>
            </div>

            {list.map((e) => (
              <div
                key={e.id}
                className="border-t border-gray-700 pt-2 space-y-1 text-sm"
              >
                <div className="flex justify-between">
                  <span>
                    {formatTime(e.start_time)} –{' '}
                    {formatTime(e.end_time)}
                  </span>

                  {canEdit(e.date) && !e.approved && (
                    <button
                      onClick={() => openEdit(e)}
                      className="text-blue-500"
                    >
                      ✏️
                    </button>
                  )}

                  {editing && (
                    <div className="fixed inset-0 bg-black/70 flex items-center justify-center">
                      <div className="bg-white p-6 rounded space-y-3 w-full max-w-sm">
                        <h3 className="font-semibold">Bewerk uren</h3>
                        <div className="space-y-2">
                          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="w-full rounded border p-2" />
                          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full rounded border p-2" />
                          <input placeholder="Klant" value={client} onChange={(e) => setClient(e.target.value)} className="w-full rounded border p-2" />
                          <input placeholder="Locatie" value={location} onChange={(e) => setLocation(e.target.value)} className="w-full rounded border p-2" />
                        </div>
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setEditing(null)} className="px-3 py-1">Annuleren</button>
                          <button onClick={saveEdit} className="px-3 py-1 bg-black text-white rounded">Opslaan</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {manual && (
                    <div className="fixed inset-0 bg-black/70 flex items-center justify-center">
                      <div className="bg-white p-6 rounded space-y-3 w-full max-w-sm">
                        <h3 className="font-semibold">Nieuwe entry van agenda</h3>
                        <div className="space-y-2">
                          <input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} className="w-full rounded border p-2" />
                          <input type="time" value={manualStart} onChange={(e) => setManualStart(e.target.value)} className="w-full rounded border p-2" />
                          <input type="time" value={manualEnd} onChange={(e) => setManualEnd(e.target.value)} className="w-full rounded border p-2" />
                          <input placeholder="Klant" value={client} onChange={(e) => setClient(e.target.value)} className="w-full rounded border p-2" />
                          <input placeholder="Locatie" value={location} onChange={(e) => setLocation(e.target.value)} className="w-full rounded border p-2" />
                        </div>
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setManual(false)} className="px-3 py-1">Annuleren</button>
                          <button onClick={saveManual} className="px-3 py-1 bg-black text-white rounded">Opslaan</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* KLUS INFO */}
                <div className="text-xs text-gray-400 flex flex-wrap gap-2">
                  {e.client && <span>👤 {e.client}</span>}
                  {e.location && <span>📍 {e.location}</span>}
                  {e.kilometers && (
                    <span>🚗 {e.kilometers} km</span>
                  )}
                  {e.parking_paid && (
                    <span>
                      🅿️ €{e.parking_cost ?? 0}
                    </span>
                  )}
                </div>

                {/* STATUS */}
                <div className="text-xs">
                  {e.approved === true && (
                    <span className="text-green-500">
                      ✅ Goedgekeurd
                    </span>
                  )}
                  {e.approved === false && (
                    <span className="text-yellow-500">
                      ⏳ Wacht op goedkeuring
                    </span>
                  )}
                  {e.manual && (
                    <span className="text-blue-400 ml-2">
                      ✍️ Handmatig
                    </span>
                  )}
                  {e.edited && !e.manual && (
                    <span className="text-gray-400 ml-2">
                      ✏️ Aangepast
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
