'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Entry {
  id: number
  user_id: string
  date: string
  start_time: string
  end_time: string | null

  client: string | null
  work_location: string | null
  kilometers: number | null
  parking_paid: boolean | null
  parking_cost: number | null

  manual?: boolean
  edited?: boolean
  approved?: boolean
}

const canEdit = (date: string) => {
  const entryDate = new Date(date)
  const today = new Date()
  const diff =
    (today.getTime() - entryDate.getTime()) /
    (1000 * 60 * 60 * 24)
  return diff <= 3
}

export default function MyOverview({ userId }: { userId?: string }) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(false)

  const [view, setView] = useState<'week' | 'month'>('week')
  const [editing, setEditing] = useState<Entry | null>(null)
  const [showManual, setShowManual] = useState(false)

  /* ========= form state ========= */
  const [date, setDate] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [client, setClient] = useState('')
  const [workLocation, setWorkLocation] = useState('')
  const [kilometers, setKilometers] = useState('')
  const [parkingPaid, setParkingPaid] = useState(false)
  const [parkingCost, setParkingCost] = useState('')

  /* ========= current week ========= */
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
  const fetchEntries = async () => {
    if (!userId) return
    setLoading(true)

    const { data, error } = await supabase
      .from('time_entries')
      .select('*')
      .eq('user_id', userId)
      .order('start_time', { ascending: false })

    if (!error) setEntries(data ?? [])
    else console.error(error)

    setLoading(false)
  }

  useEffect(() => {
    fetchEntries()
  }, [userId])

  if (!userId) return <p>Gebruiker laden…</p>
  if (loading) return <p>Overzicht laden…</p>

  /* =======================
     HELPERS
  ======================= */
  const formatTime = (d: string | null) =>
    d
      ? new Date(d).toLocaleTimeString('nl-NL', {
          hour: '2-digit',
          minute: '2-digit',
        })
      : '—'

  const hours = (s: string, e: string | null) =>
    e
      ? (
          (new Date(e).getTime() -
            new Date(s).getTime()) /
          3600000
        ).toFixed(2)
      : '—'

  /* =======================
     WEEK FILTER
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

  /* =======================
     ACTIONS
  ======================= */
  const openEdit = (e: Entry) => {
    setEditing(e)
    setDate(e.date)
    setStart(e.start_time.slice(11, 16))
    setEnd(e.end_time ? e.end_time.slice(11, 16) : '')
    setClient(e.client ?? '')
    setWorkLocation(e.work_location ?? '')
    setKilometers(e.kilometers?.toString() ?? '')
    setParkingPaid(!!e.parking_paid)
    setParkingCost(e.parking_cost?.toString() ?? '')
  }

  const saveEntry = async () => {
    if (!date || !start || !end) return

    const payload = {
      date,
      start_time: `${date}T${start}:00`,
      end_time: `${date}T${end}:00`,
      client: client || null,
      work_location: workLocation || null,
      kilometers: kilometers ? Number(kilometers) : null,
      parking_paid: parkingPaid,
      parking_cost:
        parkingPaid && parkingCost
          ? Number(parkingCost)
          : null,
      edited: true,
      approved: false,
    }

    if (editing) {
      await supabase
        .from('time_entries')
        .update(payload)
        .eq('id', editing.id)
    } else {
      await supabase.from('time_entries').insert({
        ...payload,
        user_id: userId,
        manual: true,
      })
    }

    setEditing(null)
    setShowManual(false)
    fetchEntries()
  }

  /* =======================
     RENDER
  ======================= */
  return (
    <div className="mt-6 space-y-6">
      {/* ACTION BAR */}
      <div className="flex gap-2">
        <button
          onClick={() => setView('week')}
          className={
            view === 'week'
              ? 'bg-black text-white px-3 py-1 rounded'
              : 'border px-3 py-1 rounded'
          }
        >
          Week
        </button>
        <button
          onClick={() => setView('month')}
          className={
            view === 'month'
              ? 'bg-black text-white px-3 py-1 rounded'
              : 'border px-3 py-1 rounded'
          }
        >
          Maand
        </button>
        <button
          onClick={() => setShowManual(true)}
          className="border px-3 py-1 rounded"
        >
          + Uren toevoegen
        </button>
      </div>

      {/* WEEK VIEW */}
      {view === 'week' &&
        Object.entries(grouped).map(([d, list]) => (
          <div
            key={d}
            className="border rounded p-3 space-y-2"
          >
            <div className="font-medium flex justify-between">
              <span>
                {new Date(d).toLocaleDateString('nl-NL', {
                  weekday: 'long',
                  day: '2-digit',
                  month: 'short',
                })}
              </span>
            </div>

            {list.map((e) => (
              <div
                key={e.id}
                className="text-sm border-t pt-2 space-y-1"
              >
                <div className="flex justify-between">
                  <span>
                    {formatTime(e.start_time)} –{' '}
                    {formatTime(e.end_time)} (
                    {hours(e.start_time, e.end_time)}u)
                  </span>

                  {canEdit(e.date) &&
                    !e.approved && (
                      <button
                        onClick={() => openEdit(e)}
                        className="text-blue-600"
                      >
                        ✏️
                      </button>
                    )}
                </div>

                {(e.client ||
                  e.work_location ||
                  e.kilometers ||
                  e.parking_paid) && (
                  <div className="text-xs text-gray-600">
                    {e.client && (
                      <span>👤 {e.client} </span>
                    )}
                    {e.work_location && (
                      <span>📍 {e.work_location} </span>
                    )}
                    {e.kilometers && (
                      <span>🚗 {e.kilometers} km </span>
                    )}
                    {e.parking_paid &&
                      e.parking_cost && (
                        <span>
                          🅿️ €{e.parking_cost}
                        </span>
                      )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}

      {/* MODAL (EDIT / MANUAL) */}
      {(editing || showManual) && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center">
          <div className="bg-white text-black p-4 rounded w-96 space-y-2">
            <h3 className="font-semibold">
              {editing
                ? 'Uren aanpassen'
                : 'Uren toevoegen'}
            </h3>

            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border w-full"
            />
            <input
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="border w-full"
            />
            <input
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="border w-full"
            />

            <input
              placeholder="Opdrachtgever"
              value={client}
              onChange={(e) => setClient(e.target.value)}
              className="border w-full"
            />
            <input
              placeholder="Locatie"
              value={workLocation}
              onChange={(e) =>
                setWorkLocation(e.target.value)
              }
              className="border w-full"
            />
            <input
              placeholder="Kilometers"
              value={kilometers}
              onChange={(e) =>
                setKilometers(e.target.value)
              }
              className="border w-full"
            />

            <label className="flex gap-2 items-center">
              <input
                type="checkbox"
                checked={parkingPaid}
                onChange={(e) =>
                  setParkingPaid(e.target.checked)
                }
              />
              Parkeerkosten
            </label>

            {parkingPaid && (
              <input
                placeholder="Bedrag"
                value={parkingCost}
                onChange={(e) =>
                  setParkingCost(e.target.value)
                }
                className="border w-full"
              />
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setEditing(null)
                  setShowManual(false)
                }}
              >
                Annuleren
              </button>
              <button
                onClick={saveEntry}
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
