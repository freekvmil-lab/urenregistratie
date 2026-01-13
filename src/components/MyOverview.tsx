'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AgendaSuggestions from '@/components/AgendaSuggestions'

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

const canEdit = (date: string) => {
  const entryDate = new Date(date)
  const today = new Date()
  const diffDays =
    (today.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24)
  return diffDays <= 3
}

const toLocalISOString = (date: string, time: string) => {
  const [h, m] = time.split(':').map(Number)
  const d = new Date(date)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

export default function MyOverview({ userId }: { userId?: string }) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)

  const [editing, setEditing] = useState<Entry | null>(null)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [editClient, setEditClient] = useState('')
  const [editLocation, setEditLocation] = useState('')
  const [editKilometers, setEditKilometers] = useState<number | ''>('')
  const [editParkingPaid, setEditParkingPaid] = useState(false)
  const [editParkingCost, setEditParkingCost] = useState<number | ''>('')

  const [manual, setManual] = useState(false)
  const [manualDate, setManualDate] = useState('')
  const [manualStart, setManualStart] = useState('')
  const [manualEnd, setManualEnd] = useState('')
  const [client, setClient] = useState('')
  const [location, setLocation] = useState('')
  const [kilometers, setKilometers] = useState<number | ''>('')
  const [parkingPaid, setParkingPaid] = useState(false)
  const [parkingCost, setParkingCost] = useState<number | ''>('')

  const [view, setView] = useState<'week' | 'month'>('week')
  const [currentWeek, setCurrentWeek] = useState(() => {
    const d = new Date()
    const day = d.getDay() || 7
    d.setDate(d.getDate() - day + 1)
    d.setHours(0, 0, 0, 0)
    return d
  })

  const fetchMyEntries = async () => {
    if (!userId) return
    setLoading(true)

    const { data } = await supabase
      .from('time_entries')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(90)

    if (data) setEntries(data)
    setLoading(false)
  }

  useEffect(() => {
    fetchMyEntries()
  }, [userId])

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

  const hours = (s: string, e: string | null) =>
    e ? (new Date(e).getTime() - new Date(s).getTime()) / 3600000 : 0

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
      client: editClient || null,
      location: editLocation || null,
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
      kilometers,
      parking_paid: parkingPaid,
      parking_cost: parkingPaid ? parkingCost : null,
    })

    setManual(false)
    fetchMyEntries()
  }

  return (
    <div className="mt-6 space-y-6">
      {!userId && <p>Gebruiker laden…</p>}
      {loading && <p>Overzicht laden…</p>}

      {!loading && userId && (
        <>
          <div className="flex gap-2">
            <button onClick={() => setView('week')}>Week</button>
            <button onClick={() => setView('month')}>Maand</button>
            <button
              onClick={() => {
                setManualDate(new Date().toISOString().slice(0, 10))
                setManual(true)
              }}
            >
              ➕ Handmatig
            </button>
          </div>

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

          {view === 'week' &&
            Object.entries(groupedWeek).map(([d, list]) => (
              <div key={d}>
                <strong>{d}</strong>
                {list.map((e) => (
                  <div key={e.id}>
                    {e.start_time} – {e.end_time}
                    {canEdit(e.date) && (
                      <button onClick={() => openEdit(e)}>✏️</button>
                    )}
                  </div>
                ))}
              </div>
            ))}
        </>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center">
          <div className="bg-gray-900 p-6 rounded space-y-2">
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            <button onClick={saveEdit}>Opslaan</button>
          </div>
        </div>
      )}

      {manual && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center">
          <div className="bg-gray-900 p-6 rounded space-y-2">
            <input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} />
            <input type="time" value={manualStart} onChange={(e) => setManualStart(e.target.value)} />
            <input type="time" value={manualEnd} onChange={(e) => setManualEnd(e.target.value)} />
            <button onClick={saveManual}>Opslaan</button>
          </div>
        </div>
      )}
    </div>
  )
}
