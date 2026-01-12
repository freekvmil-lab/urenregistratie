'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Entry {
  id: number
  user_id: string
  date: string
  start_time: string
  end_time: string | null
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
  const [showManual, setShowManual] = useState(false)

  const [editing, setEditing] = useState<Entry | null>(null)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [manualDate, setManualDate] = useState('')

  /* =======================
     CURRENT WEEK
  ======================= */

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

  useEffect(() => {
    if (!userId) return

    const fetchEntries = async () => {
      setLoading(true)

      const { data, error } = await supabase
        .from('time_entries')
        .select(
          'id, user_id, date, start_time, end_time, manual, edited, approved'
        )
        .eq('user_id', userId)
        .order('start_time', { ascending: false })

      if (!error) setEntries(data ?? [])
      else console.error(error)

      setLoading(false)
    }

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

  const calcHours = (s: string, e: string | null) =>
    e
      ? (
          (new Date(e).getTime() -
            new Date(s).getTime()) /
          3600000
        ).toFixed(2)
      : '—'

  /* =======================
     WEEK VIEW
  ======================= */

  const weekStart = new Date(currentWeek)
  const weekEnd = new Date(currentWeek)
  weekEnd.setDate(weekEnd.getDate() + 6)

  const weekEntries = entries.filter((e) => {
    const d = new Date(e.date)
    return d >= weekStart && d <= weekEnd
  })

  const groupedWeek = weekEntries.reduce<
    Record<string, Entry[]>
  >((acc, e) => {
    acc[e.date] = acc[e.date] || []
    acc[e.date].push(e)
    return acc
  }, {})

  const weekTotal = weekEntries.reduce(
    (s, e) =>
      s +
      (e.end_time
        ? (new Date(e.end_time).getTime() -
            new Date(e.start_time).getTime()) /
          3600000
        : 0),
    0
  )

  /* =======================
     MONTH VIEW
  ======================= */

  const monthGroups = entries.reduce<
    Record<string, number>
  >((acc, e) => {
    if (!e.end_time) return acc
    const key = e.date.slice(0, 7)
    acc[key] =
      (acc[key] || 0) +
      (new Date(e.end_time).getTime() -
        new Date(e.start_time).getTime()) /
        3600000
    return acc
  }, {})

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
    location.reload()
  }

  const saveManual = async () => {
    if (!manualDate || !start || !end) return

    await supabase.from('time_entries').insert({
      user_id: userId,
      date: manualDate,
      start_time: `${manualDate}T${start}:00`,
      end_time: `${manualDate}T${end}:00`,
      manual: true,
      approved: false,
    })

    setShowManual(false)
    location.reload()
  }

  /* =======================
     RENDER
  ======================= */

  return (
    <div className="mt-6 space-y-6">
      {/* VIEW SWITCH */}
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
          + Handmatig toevoegen
        </button>
      </div>

      {/* WEEK */}
      {view === 'week' && (
        <>
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

            <strong>
              Week van{' '}
              {weekStart.toLocaleDateString('nl-NL')}
            </strong>

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
            ([date, list]) => (
              <div
                key={date}
                className="border rounded p-3 space-y-1"
              >
                <div className="font-medium">
                  {new Date(date).toLocaleDateString(
                    'nl-NL',
                    {
                      weekday: 'short',
                      day: '2-digit',
                      month: 'short',
                    }
                  )}
                </div>

                {list.map((e) => (
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
                          onClick={() => openEdit(e)}
                        >
                          ✏️
                        </button>
                      )}
                  </div>
                ))}
              </div>
            )
          )}
        </>
      )}

      {/* MONTH */}
      {view === 'month' &&
        Object.entries(monthGroups).map(
          ([month, total]) => (
            <div
              key={month}
              className="border rounded p-3 flex justify-between"
            >
              <span>
                {new Date(
                  month + '-01'
                ).toLocaleDateString('nl-NL', {
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
              <strong>
                {total.toFixed(2)} uur
              </strong>
            </div>
          )
        )}

      {/* EDIT MODAL */}
      {editing && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center">
          <div className="bg-white text-black p-4 rounded w-80 space-y-3">
            <h3 className="font-semibold">
              Uren aanpassen
            </h3>

            <input
              type="time"
              value={start}
              onChange={(e) =>
                setStart(e.target.value)
              }
              className="border w-full"
            />
            <input
              type="time"
              value={end}
              onChange={(e) =>
                setEnd(e.target.value)
              }
              className="border w-full"
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditing(null)}
              >
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
      {showManual && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center">
          <div className="bg-white text-black p-4 rounded w-80 space-y-3">
            <h3 className="font-semibold">
              Uren handmatig invoeren
            </h3>

            <input
              type="date"
              value={manualDate}
              onChange={(e) =>
                setManualDate(e.target.value)
              }
              className="border w-full"
            />
            <input
              type="time"
              value={start}
              onChange={(e) =>
                setStart(e.target.value)
              }
              className="border w-full"
            />
            <input
              type="time"
              value={end}
              onChange={(e) =>
                setEnd(e.target.value)
              }
              className="border w-full"
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowManual(false)}
              >
                Annuleren
              </button>
              <button
                onClick={saveManual}
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
