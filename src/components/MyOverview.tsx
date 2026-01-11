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

  /* =======================
     EDIT EXISTING
  ======================= */
  const [editing, setEditing] = useState<Entry | null>(null)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  /* =======================
     MANUAL ENTRY
  ======================= */
  const [manual, setManual] = useState(false)
  const [manualDate, setManualDate] = useState('')
  const [manualStart, setManualStart] = useState('')
  const [manualEnd, setManualEnd] = useState('')
  const [client, setClient] = useState('')
  const [location, setLocation] = useState('')
  const [kilometers, setKilometers] = useState<number | ''>('')
  const [parkingPaid, setParkingPaid] = useState(false)
  const [parkingCost, setParkingCost] = useState<number | ''>('')

  /* =======================
     NAVIGATION
  ======================= */
  const [currentWeek, setCurrentWeek] = useState<Date>(() => {
    const d = new Date()
    const day = d.getDay() || 7
    d.setDate(d.getDate() - day + 1)
    return d
  })
  const [view, setView] = useState<'week' | 'month'>('week')

  /* =======================
     FETCH
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
      .limit(90)

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

  const groupedWeek = weekEntries.reduce<Record<string, Entry[]>>(
    (acc, e) => {
      acc[e.date] = acc[e.date] || []
      acc[e.date].push(e)
      return acc
    },
    {}
  )

  const weekTotal = weekEntries.reduce(
    (sum, e) => sum + calculateHours(e.start_time, e.end_time),
    0
  )

  const monthGroups = entries.reduce<Record<string, number>>(
    (acc, e) => {
      if (!e.end_time) return acc
      const key = e.date.slice(0, 7)
      acc[key] =
        (acc[key] || 0) +
        calculateHours(e.start_time, e.end_time)
      return acc
    },
    {}
  )

  /* =======================
     ACTIONS
  ======================= */
  const openEdit = (entry: Entry) => {
    setEditing(entry)
    setStart(entry.start_time.slice(11, 16))
    setEnd(entry.end_time ? entry.end_time.slice(11, 16) : '')
  }

  const saveEdit = async () => {
    if (!editing) return

    await supabase
      .from('time_entries')
      .update({
        start_time: `${editing.date}T${start}:00`,
        end_time: `${editing.date}T${end}:00`,
        edited: true,
        approved: false,
      })
      .eq('id', editing.id)

    setEditing(null)
    fetchMyEntries()
  }

  const saveManual = async () => {
    await supabase.from('time_entries').insert({
      user_id: userId,
      date: manualDate,
      start_time: `${manualDate}T${manualStart}:00`,
      end_time: `${manualDate}T${manualEnd}:00`,
      manual: true,
      edited: true,
      approved: false,
      client,
      location,
      kilometers: kilometers || null,
      parking_paid: parkingPaid,
      parking_cost: parkingPaid ? parkingCost : null,
    })

    setManual(false)
    fetchMyEntries()
  }

  if (loading) return <p>Overzicht laden…</p>

  /* =======================
     RENDER
  ======================= */
  return (
    <div className="mt-6 space-y-6">
      {/* TOP ACTIONS */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setView('week')}
          className={`px-3 py-1 rounded ${
            view === 'week'
              ? 'bg-black text-white'
              : 'border'
          }`}
        >
          Week
        </button>
        <button
          onClick={() => setView('month')}
          className={`px-3 py-1 rounded ${
            view === 'month'
              ? 'bg-black text-white'
              : 'border'
          }`}
        >
          Maand
        </button>

        <button
          onClick={() => setManual(true)}
          className="px-3 py-1 rounded border"
        >
          ➕ Handmatig toevoegen
        </button>
      </div>

      {/* WEEK VIEW */}
      {view === 'week' && (
        <div className="space-y-4">
          <div className="flex justify-between">
            <button
              onClick={() =>
                setCurrentWeek(
                  new Date(
                    currentWeek.setDate(
                      currentWeek.getDate() - 7
                    )
                  )
                )
              }
            >
              ← Vorige
            </button>

            <span className="font-semibold">
              Week van{' '}
              {weekStart.toLocaleDateString('nl-NL')}
            </span>

            <button
              onClick={() =>
                setCurrentWeek(
                  new Date(
                    currentWeek.setDate(
                      currentWeek.getDate() + 7
                    )
                  )
                )
              }
            >
              Volgende →
            </button>
          </div>

          <p className="font-bold">
            Totaal: {weekTotal.toFixed(2)} uur
          </p>

          {Object.entries(groupedWeek).map(
            ([date, dayEntries]) => {
              const total = dayEntries.reduce(
                (s, e) =>
                  s +
                  calculateHours(
                    e.start_time,
                    e.end_time
                  ),
                0
              )

              return (
                <div
                  key={date}
                  className="border rounded p-3"
                >
                  <div className="flex justify-between font-medium mb-1">
                    <span>{formatDate(date)}</span>
                    <span>{total.toFixed(2)} uur</span>
                  </div>

                  {dayEntries.map((e) => (
                    <div
                      key={e.id}
                      className="flex justify-between text-sm"
                    >
                      <span>
                        {formatTime(e.start_time)} –{' '}
                        {formatTime(e.end_time)}
                      </span>

                      {canEdit(e.date) &&
                        !e.approved && (
                          <button
                            onClick={() =>
                              openEdit(e)
                            }
                            className="text-blue-600"
                          >
                            ✏️
                          </button>
                        )}
                    </div>
                  ))}
                </div>
              )
            }
          )}
        </div>
      )}

      {/* MONTH VIEW */}
      {view === 'month' && (
        <div className="space-y-3">
          {Object.entries(monthGroups).map(
            ([month, total]) => (
              <div
                key={month}
                className="border rounded p-3 flex justify-between"
              >
                <span>
                  {new Date(month + '-01').toLocaleDateString(
                    'nl-NL',
                    {
                      month: 'long',
                      year: 'numeric',
                    }
                  )}
                </span>
                <span className="font-semibold">
                  {total.toFixed(2)} uur
                </span>
              </div>
            )
          )}
        </div>
      )}

      {/* EDIT MODAL */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
          <div className="bg-white p-4 rounded w-80 space-y-4">
            <h3 className="font-semibold">Uren aanpassen</h3>

            <label>
              Start
              <input
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="border w-full"
              />
            </label>

            <label>
              Stop
              <input
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="border w-full"
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

      {/* MANUAL MODAL */}
{manual && (
  <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
    <div className="
      bg-gray-900
      text-gray-100
      p-6
      rounded-lg
      w-96
      space-y-4
      border border-gray-700
    ">
      <h3 className="font-semibold text-lg">
        Uren handmatig invoeren
      </h3>

      <input
        type="date"
        value={manualDate}
        onChange={(e) => setManualDate(e.target.value)}
        className="w-full px-3 py-2 rounded
          bg-gray-800 border border-gray-700
          text-gray-100 placeholder-gray-400
          focus:outline-none focus:ring-1 focus:ring-gray-500"
      />

      <div className="flex gap-2">
        <input
          type="time"
          value={manualStart}
          onChange={(e) => setManualStart(e.target.value)}
          className="w-full px-3 py-2 rounded
            bg-gray-800 border border-gray-700
            text-gray-100
            focus:outline-none focus:ring-1 focus:ring-gray-500"
        />
        <input
          type="time"
          value={manualEnd}
          onChange={(e) => setManualEnd(e.target.value)}
          className="w-full px-3 py-2 rounded
            bg-gray-800 border border-gray-700
            text-gray-100
            focus:outline-none focus:ring-1 focus:ring-gray-500"
        />
      </div>

      <input
        placeholder="Opdrachtgever"
        value={client}
        onChange={(e) => setClient(e.target.value)}
        className="w-full px-3 py-2 rounded
          bg-gray-800 border border-gray-700
          text-gray-100 placeholder-gray-400
          focus:outline-none focus:ring-1 focus:ring-gray-500"
      />

      <input
        placeholder="Locatie"
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        className="w-full px-3 py-2 rounded
          bg-gray-800 border border-gray-700
          text-gray-100 placeholder-gray-400
          focus:outline-none focus:ring-1 focus:ring-gray-500"
      />

      <input
        type="number"
        placeholder="Kilometers"
        value={kilometers}
        onChange={(e) => setKilometers(Number(e.target.value))}
        className="w-full px-3 py-2 rounded
          bg-gray-800 border border-gray-700
          text-gray-100 placeholder-gray-400
          focus:outline-none focus:ring-1 focus:ring-gray-500"
      />

      <label className="flex items-center gap-2 text-gray-200">
        <input
          type="checkbox"
          checked={parkingPaid}
          onChange={(e) => setParkingPaid(e.target.checked)}
          className="accent-gray-400"
        />
        Parkeerkosten gemaakt
      </label>

      {parkingPaid && (
        <input
          type="number"
          placeholder="Parkeerkosten (€)"
          value={parkingCost}
          onChange={(e) => setParkingCost(Number(e.target.value))}
          className="w-full px-3 py-2 rounded
            bg-gray-800 border border-gray-700
            text-gray-100 placeholder-gray-400
            focus:outline-none focus:ring-1 focus:ring-gray-500"
        />
      )}

      <div className="flex justify-end gap-3 pt-2">
        <button
          onClick={() => setManual(false)}
          className="text-gray-400 hover:text-gray-200"
        >
          Annuleren
        </button>
        <button
          onClick={saveManual}
          className="bg-white text-black px-4 py-2 rounded
            hover:bg-gray-200"
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
