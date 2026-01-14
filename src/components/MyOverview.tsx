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

const toLocalYmd = (d: Date) => {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
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

const needsDetails = (e: Entry) => {
  if (e.manual) return false
  // Only nudge after the shift is stopped
  if (!e.end_time) return false

  const missingClient = !e.client || !String(e.client).trim()
  const missingLocation = !e.location || !String(e.location).trim()
  const parkingMissingCost = Boolean(e.parking_paid) && (e.parking_cost === null || e.parking_cost === undefined)

  return missingClient || missingLocation || parkingMissingCost
}

/* =======================
   COMPONENT
======================= */

export default function MyOverview({ userId }: { userId?: string }) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [clientOptions, setClientOptions] = useState<string[]>([])
  const [manualError, setManualError] = useState<string | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

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
  const [editKilometers, setEditKilometers] = useState<number | ''>('')
  const [editParkingPaid, setEditParkingPaid] = useState(false)
  const [editParkingCost, setEditParkingCost] = useState<number | ''>('')
  const [manualKilometers, setManualKilometers] = useState<number | ''>('')
  const [manualParkingPaid, setManualParkingPaid] = useState(false)
  const [manualParkingCost, setManualParkingCost] = useState<number | ''>('')

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

  const fetchClients = async () => {
    const { data, error } = await supabase
      .from('clients')
      .select('name')
      .order('name', { ascending: true })

    if (error) {
      // If RLS blocks SELECT, don't break manual entry; just hide suggestions.
      setClientOptions([])
      return
    }

    const names = (data ?? []).map((r: any) => String(r.name)).filter(Boolean)
    setClientOptions(Array.from(new Set(names)))
  }

  const fetchRole = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setIsAdmin(false)
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    setIsAdmin(profile?.role === 'admin')
  }

  useEffect(() => {
    fetchEntries()
  }, [userId])

  useEffect(() => {
    fetchClients()
    fetchRole()
  }, [])

  const normalizedClientSet = new Set(
    clientOptions.map((c) => c.trim().toLowerCase()).filter(Boolean)
  )

  const isKnownClient = (name: string | null | undefined) => {
    const raw = String(name ?? '').trim()
    if (!raw) return true
    return normalizedClientSet.has(raw.toLowerCase())
  }

  const validateClientForEmployee = () => {
    const raw = client.trim()
    if (!raw) return { ok: true as const }
    if (isAdmin) return { ok: true as const }

    const exists = normalizedClientSet.has(raw.toLowerCase())
    if (!exists) {
      return {
        ok: false as const,
        message:
          'Onbekende opdrachtgever. Kies een bestaande opdrachtgever (admins beheren de lijst via Admin → Opdrachtgevers).',
      }
    }
    return { ok: true as const }
  }

  const toFriendlyClientRlsError = (err: any) => {
    if (!err) return null
    if (err.code !== '42501') return null
    const msg = String(err.message ?? '')
    if (!msg.toLowerCase().includes('clients')) return null
    return 'Je hebt geen rechten om automatisch een nieuwe opdrachtgever aan te maken. Kies een bestaande opdrachtgever, of vraag een admin om deze toe te voegen via Admin → Opdrachtgevers.'
  }

  const openEdit = (e: Entry) => {
    setEditError(null)
    setEditing(e)
    setStart(
      new Date(e.start_time).toLocaleTimeString('nl-NL', {
        hour: '2-digit',
        minute: '2-digit',
      })
    )
    setEnd(
      e.end_time
        ? new Date(e.end_time).toLocaleTimeString('nl-NL', {
            hour: '2-digit',
            minute: '2-digit',
          })
        : ''
    )
    setClient(e.client ?? '')
    setLocation(e.location ?? '')
    setEditKilometers(e.kilometers ?? '')
    setEditParkingPaid(Boolean(e.parking_paid))
    setEditParkingCost(e.parking_cost ?? '')

    // If this entry has a legacy client name that's not in the clients table yet,
    // don't force the employee into an invalid <select> value.
    if (!isAdmin && e.client && !isKnownClient(e.client)) {
      setClient('')
    }
  }

  const saveEdit = async () => {
    if (!editing) return
    setEditError(null)

    const v = validateClientForEmployee()
    if (!v.ok) {
      setEditError(v.message)
      return
    }

    const payload: any = {
      start_time: toLocalISOString(editing.date, start),
      end_time: toLocalISOString(editing.date, end),
      location: location || null,
      kilometers: editKilometers || null,
      parking_paid: editParkingPaid,
      parking_cost: editParkingPaid ? editParkingCost : null,
      edited: true,
      approved: false,
    }

    // Admins can freely set/clear client.
    if (isAdmin) {
      payload.client = client.trim() || null
    } else {
      // Employees: only update client if they selected a known client.
      const selected = client.trim()
      if (selected) {
        payload.client = selected
      } else if (!editing.client) {
        // If there was no client before, allow clearing (keep null).
        payload.client = null
      }
      // If editing.client exists but isn't in clients, and employee didn't select,
      // omit client field to avoid triggering any auto-create logic.
    }

    const { error } = await supabase.from('time_entries').update(payload).eq('id', editing.id)

    if (error) {
      setEditError(toFriendlyClientRlsError(error) ?? (error.message || 'Opslaan mislukt'))
      return
    }

    setEditing(null)
    fetchEntries()
  }

  const saveManual = async () => {
    if (!userId) return
    setManualError(null)

    const v = validateClientForEmployee()
    if (!v.ok) {
      setManualError(v.message)
      return
    }

    const { error } = await supabase.from('time_entries').insert({
      user_id: userId,
      date: manualDate,
      start_time: toLocalISOString(manualDate, manualStart),
      end_time: toLocalISOString(manualDate, manualEnd),
      manual: true,
      edited: true,
      approved: false,
      client: client || null,
      location: location || null,
      kilometers: manualKilometers || null,
      parking_paid: manualParkingPaid,
      parking_cost: manualParkingPaid ? manualParkingCost : null,
    })

    if (error) {
      setManualError(toFriendlyClientRlsError(error) ?? (error.message || 'Opslaan mislukt'))
      return
    }

    setManual(false)
    fetchEntries()
  }

  useEffect(() => {
    const handler = (ev: any) => {
      const date = ev?.detail?.date ?? new Date().toISOString().slice(0, 10)
      setManualDate(date)
      setManualError(null)
      setManual(true)
    }

    window.addEventListener('openManual', handler as EventListener)
    return () => window.removeEventListener('openManual', handler as EventListener)
  }, [])

  useEffect(() => {
    const handler = (ev: any) => {
      const startIso = ev?.detail?.start
      const endIso = ev?.detail?.end
      const title = String(ev?.detail?.title ?? '')
      const eventLocation = ev?.detail?.location ?? null
      const isAllDay = Boolean(ev?.detail?.isAllDay)

      if (!startIso || !endIso) {
        // fallback: just open manual for today
        const d = new Date()
        setManualDate(toLocalYmd(d))
        setManual(true)
        return
      }

      setManual(true)
      setManualError(null)
      const s = new Date(startIso)
      const en = new Date(endIso)

      setManualDate(toLocalYmd(s))
      if (isAllDay) {
        setManualStart('09:00')
        setManualEnd('17:00')
      } else {
        setManualStart(
          s.toLocaleTimeString('nl-NL', {
            hour: '2-digit',
            minute: '2-digit',
          })
        )
        setManualEnd(
          en.toLocaleTimeString('nl-NL', {
            hour: '2-digit',
            minute: '2-digit',
          })
        )
      }

      // If title looks like "OPDRACHTGEVER - rest", set opdrachtgever automatically
      const [maybeClient] = title.split(' - ', 1)
      setClient(maybeClient)
      setLocation(eventLocation ?? '')
      setManualKilometers('')
      setManualParkingPaid(false)
      setManualParkingCost('')
    }

    window.addEventListener('openManualPrefill', handler as EventListener)
    return () => window.removeEventListener('openManualPrefill', handler as EventListener)
  }, [])

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

            {/* inline start/stop is rendered in TimeTracker; no duplicate here */}

                <datalist id="client-list">
                  {clientOptions.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>

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
                      <div className="bg-gray-900 text-white p-6 rounded space-y-3 w-full max-w-sm">
                        <h3 className="font-semibold">Bewerk uren</h3>
                        <div className="space-y-2">
                          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="w-full rounded bg-gray-800 border-gray-700 text-white p-2" />
                          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full rounded bg-gray-800 border-gray-700 text-white p-2" />
                          {isAdmin ? (
                            <>
                              <select
                                value={client}
                                onChange={(e) => setClient(e.target.value)}
                                className="w-full rounded bg-gray-800 border border-gray-700 text-white p-2"
                              >
                                <option value="">Selecteer opdrachtgever…</option>
                                {clientOptions.map((name) => (
                                  <option key={name} value={name}>
                                    {name}
                                  </option>
                                ))}
                              </select>

                              <div className="text-xs text-gray-400">Of typ een nieuwe / andere opdrachtgever:</div>
                              <input
                                list="client-list"
                                placeholder="Klant"
                                value={client}
                                onChange={(e) => setClient(e.target.value)}
                                className="w-full rounded bg-gray-800 border border-gray-700 text-white p-2"
                              />
                            </>
                          ) : (
                            <>
                              {editing?.client && !isKnownClient(editing.client) && (
                                <div className="text-xs text-gray-300">
                                  Huidige opdrachtgever: <span className="font-semibold">{editing.client}</span> (nog niet in lijst). Je kunt optioneel een bestaande kiezen.
                                </div>
                              )}
                            <select
                              value={client}
                              onChange={(e) => setClient(e.target.value)}
                              className="w-full rounded bg-gray-800 border border-gray-700 text-white p-2"
                            >
                              <option value="">Selecteer opdrachtgever…</option>
                              {clientOptions.map((name) => (
                                <option key={name} value={name}>
                                  {name}
                                </option>
                              ))}
                            </select>
                            </>
                          )}
                          <input placeholder="Locatie" value={location} onChange={(e) => setLocation(e.target.value)} className="w-full rounded bg-gray-800 border-gray-700 text-white p-2" />
                          <div className="flex gap-2">
                            <input type="number" placeholder="Kilometers" value={editKilometers === '' ? '' : editKilometers} onChange={(e) => setEditKilometers(e.target.value === '' ? '' : Number(e.target.value))} className="w-1/2 rounded bg-gray-800 border-gray-700 text-white p-2" />
                            <label className="flex items-center gap-2">
                              <input type="checkbox" checked={editParkingPaid} onChange={(e) => setEditParkingPaid(e.target.checked)} />
                              Parkeren
                            </label>
                          </div>
                          {editParkingPaid && (
                            <input type="number" placeholder="Parkeerkosten" value={editParkingCost === '' ? '' : editParkingCost} onChange={(e) => setEditParkingCost(e.target.value === '' ? '' : Number(e.target.value))} className="w-full rounded bg-gray-800 border-gray-700 text-white p-2" />
                          )}

                          {editError && (
                            <div className="text-sm text-red-300">{editError}</div>
                          )}
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
                      <div className="bg-gray-900 text-white p-6 rounded space-y-3 w-full max-w-sm">
                        <h3 className="font-semibold">Nieuwe entry van agenda</h3>
                        <div className="space-y-2">
                          <input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} className="w-full rounded bg-gray-800 border-gray-700 text-white p-2" />
                          <input type="time" value={manualStart} onChange={(e) => setManualStart(e.target.value)} className="w-full rounded bg-gray-800 border-gray-700 text-white p-2" />
                          <input type="time" value={manualEnd} onChange={(e) => setManualEnd(e.target.value)} className="w-full rounded bg-gray-800 border-gray-700 text-white p-2" />
                          {isAdmin ? (
                            <>
                              <select
                                value={client}
                                onChange={(e) => setClient(e.target.value)}
                                className="w-full rounded bg-gray-800 border border-gray-700 text-white p-2"
                              >
                                <option value="">Selecteer opdrachtgever…</option>
                                {clientOptions.map((name) => (
                                  <option key={name} value={name}>
                                    {name}
                                  </option>
                                ))}
                              </select>

                              <div className="text-xs text-gray-400">Of typ een nieuwe / andere opdrachtgever:</div>
                              <input
                                list="client-list"
                                placeholder="Klant"
                                value={client}
                                onChange={(e) => setClient(e.target.value)}
                                className="w-full rounded bg-gray-800 border border-gray-700 text-white p-2"
                              />
                            </>
                          ) : (
                            <select
                              value={client}
                              onChange={(e) => setClient(e.target.value)}
                              className="w-full rounded bg-gray-800 border border-gray-700 text-white p-2"
                            >
                              <option value="">Selecteer opdrachtgever…</option>
                              {clientOptions.map((name) => (
                                <option key={name} value={name}>
                                  {name}
                                </option>
                              ))}
                            </select>
                          )}
                          <input placeholder="Locatie" value={location} onChange={(e) => setLocation(e.target.value)} className="w-full rounded bg-gray-800 border-gray-700 text-white p-2" />
                          <div className="flex gap-2">
                            <input type="number" placeholder="Kilometers" value={manualKilometers === '' ? '' : manualKilometers} onChange={(e) => setManualKilometers(e.target.value === '' ? '' : Number(e.target.value))} className="w-1/2 rounded bg-gray-800 border-gray-700 text-white p-2" />
                            <label className="flex items-center gap-2 text-white">
                              <input type="checkbox" checked={manualParkingPaid} onChange={(e) => setManualParkingPaid(e.target.checked)} />
                              Parkeren
                            </label>
                          </div>
                          {manualParkingPaid && (
                            <input type="number" placeholder="Parkeerkosten" value={manualParkingCost === '' ? '' : manualParkingCost} onChange={(e) => setManualParkingCost(e.target.value === '' ? '' : Number(e.target.value))} className="w-full rounded bg-gray-800 border-gray-700 text-white p-2" />
                          )}

                          {manualError && (
                            <div className="text-sm text-red-300">{manualError}</div>
                          )}
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
                  {e.manual ? (
                    <span className="text-blue-400 ml-2">Handmatig ingevoerd</span>
                  ) : (
                    <span className="text-purple-400 ml-2">Start/Stop knop</span>
                  )}
                  {!e.manual && needsDetails(e) && (
                    <span className="text-gray-400 ml-2">✏️ Data invullen</span>
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
