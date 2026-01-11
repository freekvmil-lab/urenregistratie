'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

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
  const entryDate = new Date(date)
  const today = new Date()
  const diffDays =
    (today.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24)
  return diffDays <= 3
}

// 🔥 TIMEZONE-SAFE
const toLocalISOString = (date: string, time: string) => {
  const [h, m] = time.split(':').map(Number)
  const d = new Date(date)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

/* =======================
   COMPONENT
======================= */

export default function MyOverview({ userId }: { userId: string }) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)

  /* ===== EDIT EXISTING ===== */
  const [editing, setEditing] = useState<Entry | null>(null)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [editClient, setEditClient] = useState('')
  const [editLocation, setEditLocation] = useState('')
  const [editKilometers, setEditKilometers] = useState<number | ''>('')
  const [editParkingPaid, setEditParkingPaid] = useState(false)
  const [editParkingCost, setEditParkingCost] = useState<number | ''>('')

  /* ===== MANUAL ENTRY ===== */
  const [manual, setManual] = useState(false)
  const [manualDate, setManualDate] = useState('')
  const [manualStart, setManualStart] = useState('')
  const [manualEnd, setManualEnd] = useState('')
  const [client, setClient] = useState('')
  const [location, setLocation] = useState('')
  const [kilometers, setKilometers] = useState<number | ''>('')
  const [parkingPaid, setParkingPaid] = useState(false)
  const [parkingCost, setParkingCost] = useState<number | ''>('')

  /* ===== WEEK / MONTH ===== */
  const [view, setView] = useState<'week' | 'month'>('week')
  const [currentWeek, setCurrentWeek] = useState(() => {
    const d = new Date()
    const day = d.getDay() || 7
    d.setDate(d.getDate() - day + 1)
    return d
  })

  /* =======================
     FETCH
  ======================= */

  const fetchMyEntries = async () => {
    setLoading(true)

    const { data } = await supabase
      .from('time_entries')
      .select(`
        id, user_id, date, start_time, end_time,
        edited, approved,
        client, location, kilometers,
        parking_paid, parking_cost
      `)
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
     FORMATTERS
  ======================= */

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
      : ''

  const hours = (s: string, e: string | null) =>
    e ? (new Date(e).getTime() - new Date(s).getTime()) / 3600000 : 0

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
    (sum, e) => sum + hours(e.start_time, e.end_time),
    0
  )

  const monthGroups = entries.reduce<Record<string, number>>(
    (acc, e) => {
      if (!e.end_time) return acc
      const key = e.date.slice(0, 7)
      acc[key] = (acc[key] || 0) + hours(e.start_time, e.end_time)
      return acc
    },
    {}
  )

  /* =======================
     ACTIONS
  ======================= */

  const openEdit = (e: Entry) => {
    setEditing(e)
    setStart(e.start_time.slice(11, 16))
    setEnd(e.end_time ? e.end_time.slice(11, 16) : '')
    setEditClient(e.client ?? '')
    setEditLocation(e.location ?? '')
    setEditKilometers(e.kilometers ?? '')
    setEditParkingPaid(Boolean(e.parking_paid))
    setEditParkingCost(e.parking_cost ?? '')
  }

  const saveEdit = async () => {
    if (!editing) return

    await supabase.from('time_entries').update({
      start_time: toLocalISOString(editing.date, start),
      end_time: toLocalISOString(editing.date, end),
      client: editClient,
      location: editLocation,
      kilometers: editKilometers || null,
      parking_paid: editParkingPaid,
      parking_cost: editParkingPaid ? editParkingCost : null,
      edited: true,
      approved: false,
    }).eq('id', editing.id)

    setEditing(null)
    fetchMyEntries()
  }

  const saveManual = async () => {
    if (!manualDate || !manualStart || !manualEnd) {
      alert('Datum, start en eindtijd zijn verplicht')
      return
    }

    await supabase.from('time_entries').insert({
      user_id: userId,
      date: manualDate,
      start_time: toLocalISOString(manualDate, manualStart),
      end_time: toLocalISOString(manualDate, manualEnd),
      client,
      location,
      kilometers: kilometers || null,
      parking_paid: parkingPaid,
      parking_cost: parkingPaid ? parkingCost : null,
      manual: true,
      edited: true,
      approved: false,
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
      {/* TOP */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setView('week')} className={view === 'week' ? 'bg-black text-white px-3 py-1 rounded' : 'border px-3 py-1 rounded'}>Week</button>
        <button onClick={() => setView('month')} className={view === 'month' ? 'bg-black text-white px-3 py-1 rounded' : 'border px-3 py-1 rounded'}>Maand</button>
        <button onClick={() => { setManualDate(new Date().toISOString().slice(0,10)); setManual(true) }} className="border px-3 py-1 rounded">
          ➕ Handmatig toevoegen
        </button>
      </div>

      {/* WEEK */}
      {view === 'week' && (
        <div className="space-y-4">
          <div className="flex justify-between">
            <button onClick={() => setCurrentWeek(new Date(currentWeek.setDate(currentWeek.getDate() - 7)))}>← Vorige</button>
            <strong>Week van {weekStart.toLocaleDateString('nl-NL')}</strong>
            <button onClick={() => setCurrentWeek(new Date(currentWeek.setDate(currentWeek.getDate() + 7)))}>Volgende →</button>
          </div>

          <p className="font-bold">Totaal: {weekTotal.toFixed(2)} uur</p>

          {Object.entries(groupedWeek).map(([date, list]) => (
            <div key={date} className="border rounded p-3">
              <div className="flex justify-between font-medium mb-1">
                <span>{formatDate(date)}</span>
                <span>{list.reduce((s, e) => s + hours(e.start_time, e.end_time), 0).toFixed(2)} uur</span>
              </div>

              {list.map((e) => (
                <div key={e.id} className="flex justify-between text-sm">
                  <span>{formatTime(e.start_time)} – {formatTime(e.end_time)}</span>
                  {canEdit(e.date) && !e.approved && (
                    <button onClick={() => openEdit(e)} className="text-blue-600">✏️</button>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* MONTH */}
      {view === 'month' && (
        <div className="space-y-3">
          {Object.entries(monthGroups).map(([m, t]) => (
            <div key={m} className="border rounded p-3 flex justify-between">
              <span>{new Date(m + '-01').toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })}</span>
              <strong>{t.toFixed(2)} uur</strong>
            </div>
          ))}
        </div>
      )}

      {/* EDIT MODAL */}
      {editing && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-900 text-gray-100 p-6 rounded-lg w-96 border border-gray-700 space-y-3">
            <h3 className="font-semibold text-lg">Uren aanpassen</h3>

            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="w-full px-3 py-2 rounded bg-gray-800 border border-gray-700" />
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full px-3 py-2 rounded bg-gray-800 border border-gray-700" />
            <input placeholder="Opdrachtgever" value={editClient} onChange={(e) => setEditClient(e.target.value)} className="w-full px-3 py-2 rounded bg-gray-800 border border-gray-700" />
            <input placeholder="Locatie" value={editLocation} onChange={(e) => setEditLocation(e.target.value)} className="w-full px-3 py-2 rounded bg-gray-800 border border-gray-700" />
            <input type="number" placeholder="Kilometers" value={editKilometers} onChange={(e) => setEditKilometers(Number(e.target.value))} className="w-full px-3 py-2 rounded bg-gray-800 border border-gray-700" />

            <label className="flex items-center gap-2">
              <input type="checkbox" checked={editParkingPaid} onChange={(e) => setEditParkingPaid(e.target.checked)} className="accent-gray-400" />
              Parkeerkosten gemaakt
            </label>

            {editParkingPaid && (
              <input type="number" placeholder="Parkeerkosten (€)" value={editParkingCost} onChange={(e) => setEditParkingCost(Number(e.target.value))} className="w-full px-3 py-2 rounded bg-gray-800 border border-gray-700" />
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setEditing(null)} className="text-gray-400">Annuleren</button>
              <button onClick={saveEdit} className="bg-white text-black px-4 py-2 rounded">Opslaan</button>
            </div>
          </div>
        </div>
      )}

      {/* MANUAL MODAL */}
      {manual && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-900 text-gray-100 p-6 rounded-lg w-96 border border-gray-700 space-y-3">
            <h3 className="font-semibold text-lg">Uren handmatig invoeren</h3>

            <input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} className="w-full px-3 py-2 rounded bg-gray-800 border border-gray-700" />
            <input type="time" value={manualStart} onChange={(e) => setManualStart(e.target.value)} className="w-full px-3 py-2 rounded bg-gray-800 border border-gray-700" />
            <input type="time" value={manualEnd} onChange={(e) => setManualEnd(e.target.value)} className="w-full px-3 py-2 rounded bg-gray-800 border border-gray-700" />
            <input placeholder="Opdrachtgever" value={client} onChange={(e) => setClient(e.target.value)} className="w-full px-3 py-2 rounded bg-gray-800 border border-gray-700" />
            <input placeholder="Locatie" value={location} onChange={(e) => setLocation(e.target.value)} className="w-full px-3 py-2 rounded bg-gray-800 border border-gray-700" />
            <input type="number" placeholder="Kilometers" value={kilometers} onChange={(e) => setKilometers(Number(e.target.value))} className="w-full px-3 py-2 rounded bg-gray-800 border border-gray-700" />

            <label className="flex items-center gap-2">
              <input type="checkbox" checked={parkingPaid} onChange={(e) => setParkingPaid(e.target.checked)} className="accent-gray-400" />
              Parkeerkosten gemaakt
            </label>

            {parkingPaid && (
              <input type="number" placeholder="Parkeerkosten (€)" value={parkingCost} onChange={(e) => setParkingCost(Number(e.target.value))} className="w-full px-3 py-2 rounded bg-gray-800 border border-gray-700" />
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setManual(false)} className="text-gray-400">Annuleren</button>
              <button onClick={saveManual} className="bg-white text-black px-4 py-2 rounded">Opslaan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
