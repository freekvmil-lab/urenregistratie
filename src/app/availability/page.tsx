'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type AvailabilityRow = {
  id: number
  user_id: string
  date: string
  start_time: string | null
  end_time: string | null
  status: 'available' | 'unavailable'
  note: string | null
}

const todayYmd = () => {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const normalizeTime = (t: string) => {
  const v = String(t || '').trim()
  if (!v) return null
  // HTML time input usually yields HH:MM
  if (/^\d{2}:\d{2}$/.test(v)) return `${v}:00`
  if (/^\d{2}:\d{2}:\d{2}$/.test(v)) return v
  return null
}

const displayTime = (t: string | null) => {
  if (!t) return '—'
  // 'HH:MM:SS' -> 'HH:MM'
  return String(t).slice(0, 5)
}

export default function AvailabilityPage() {
  const [ready, setReady] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  const [rows, setRows] = useState<AvailabilityRow[]>([])
  const [loading, setLoading] = useState(false)

  const [editing, setEditing] = useState<AvailabilityRow | null>(null)
  const [date, setDate] = useState(todayYmd())
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [status, setStatus] = useState<'available' | 'unavailable'>('available')
  const [note, setNote] = useState('')

  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadUserAndData = async () => {
    setMessage(null)
    setError(null)

    const { data: auth } = await supabase.auth.getUser()
    const u = auth.user

    setUserId(u?.id ?? null)
    setReady(true)

    if (!u) return

    setLoading(true)
    try {
      const { data, error: loadErr } = await supabase
        .from('availability')
        .select('id, user_id, date, start_time, end_time, status, note')
        .eq('user_id', u.id)
        .order('date', { ascending: true })
        .order('start_time', { ascending: true })

      if (loadErr) {
        setError(loadErr.message || 'Laden mislukt')
        setRows([])
        return
      }

      setRows((data ?? []) as AvailabilityRow[])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUserAndData()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadUserAndData()
    })

    return () => subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const resetForm = () => {
    setEditing(null)
    setDate(todayYmd())
    setStart('')
    setEnd('')
    setStatus('available')
    setNote('')
  }

  const validate = () => {
    const d = String(date || '').trim()
    if (!d) return 'Kies een datum.'

    const s = normalizeTime(start)
    const e = normalizeTime(end)

    if ((start && !s) || (end && !e)) return 'Tijd moet HH:MM zijn.'

    if (s && e) {
      // Compare HH:MM:SS strings lexicographically (works for fixed width)
      if (e <= s) return 'Eindtijd moet na starttijd zijn.'
    }

    return null
  }

  const openEdit = (r: AvailabilityRow) => {
    setMessage(null)
    setError(null)
    setEditing(r)
    setDate(r.date)
    setStart(displayTime(r.start_time))
    setEnd(displayTime(r.end_time))
    setStatus(r.status)
    setNote(String(r.note ?? ''))
  }

  const save = async () => {
    setMessage(null)
    setError(null)

    if (!userId) {
      setError('Niet ingelogd')
      return
    }

    const v = validate()
    if (v) {
      setError(v)
      return
    }

    const payload = {
      user_id: userId,
      date,
      start_time: normalizeTime(start),
      end_time: normalizeTime(end),
      status,
      note: String(note || '').trim() || null,
    }

    setLoading(true)
    try {
      if (editing) {
        const { error: updErr } = await supabase
          .from('availability')
          .update({
            date: payload.date,
            start_time: payload.start_time,
            end_time: payload.end_time,
            status: payload.status,
            note: payload.note,
          })
          .eq('id', editing.id)

        if (updErr) {
          setError(updErr.message || 'Opslaan mislukt')
          return
        }

        setMessage('Beschikbaarheid bijgewerkt.')
      } else {
        const { error: insErr } = await supabase
          .from('availability')
          .insert(payload)

        if (insErr) {
          setError(insErr.message || 'Opslaan mislukt')
          return
        }

        setMessage('Beschikbaarheid opgeslagen.')
      }

      resetForm()
      await loadUserAndData()
    } finally {
      setLoading(false)
    }
  }

  const remove = async (r: AvailabilityRow) => {
    const ok = confirm('Weet je zeker dat je dit wilt verwijderen?')
    if (!ok) return

    setMessage(null)
    setError(null)
    setLoading(true)

    try {
      const { error: delErr } = await supabase
        .from('availability')
        .delete()
        .eq('id', r.id)

      if (delErr) {
        setError(delErr.message || 'Verwijderen mislukt')
        return
      }

      if (editing?.id === r.id) resetForm()

      setMessage('Verwijderd.')
      await loadUserAndData()
    } finally {
      setLoading(false)
    }
  }

  const grouped = useMemo(() => {
    const m = new Map<string, AvailabilityRow[]>()
    for (const r of rows) {
      const key = r.date
      const list = m.get(key) ?? []
      list.push(r)
      m.set(key, list)
    }
    return Array.from(m.entries())
  }, [rows])

  if (!ready) {
    return (
      <main className="p-6">
        <p>Loading…</p>
      </main>
    )
  }

  if (!userId) {
    return (
      <main className="p-6 space-y-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Beschikbaarheid</h1>
        <p>Je bent niet ingelogd.</p>
        <a href="/login" className="inline-block border border-orange-500/60 hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10 px-3 py-2 rounded">
          Inloggen
        </a>
      </main>
    )
  }

  return (
    <main className="p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Beschikbaarheid</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Geef aan wanneer je beschikbaar of juist niet beschikbaar bent.
        </p>
      </header>

      <section className="border border-orange-200/60 dark:border-orange-500/30 rounded-lg p-4 bg-white/60 dark:bg-gray-900/40 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-300">Datum</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-300">Van</label>
            <input
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="border rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-300">Tot</label>
            <input
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="border rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-300">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as 'available' | 'unavailable')}
              className="border rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="available">Beschikbaar</option>
              <option value="unavailable">Niet beschikbaar</option>
            </select>
          </div>

          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs text-gray-600 dark:text-gray-300">Opmerking (optioneel)</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Bijv. alleen ochtend, dokter, vakantie..."
              className="w-full border rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={loading}
              className="px-3 py-2 rounded bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white"
            >
              {editing ? 'Bijwerken' : 'Opslaan'}
            </button>

            {editing && (
              <button
                onClick={resetForm}
                disabled={loading}
                className="px-3 py-2 rounded border border-orange-500/60 hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10"
              >
                Annuleren
              </button>
            )}
          </div>
        </div>

        {error && <div className="text-sm text-red-600">{error}</div>}
        {message && <div className="text-sm text-orange-700 dark:text-orange-300">{message}</div>}

        <div className="text-xs text-gray-500 dark:text-gray-400">
          Tip: laat “Van/Tot” leeg voor een hele dag.
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Overzicht</h2>

        {loading && !rows.length ? (
          <p>Loading…</p>
        ) : !rows.length ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">Nog geen beschikbaarheid ingevuld.</p>
        ) : (
          <div className="space-y-3">
            {grouped.map(([d, items]) => (
              <div
                key={d}
                className="border border-orange-200/60 dark:border-orange-500/30 rounded-lg p-3 bg-white/60 dark:bg-gray-900/40"
              >
                <div className="font-semibold text-gray-900 dark:text-gray-100">{d}</div>

                <div className="mt-2 space-y-2">
                  {items.map((r) => (
                    <div
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-t border-orange-500/10 pt-2"
                    >
                      <div className="text-sm text-gray-900 dark:text-gray-100">
                        <span className={r.status === 'available' ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                          {r.status === 'available' ? 'Beschikbaar' : 'Niet beschikbaar'}
                        </span>
                        <span className="mx-2 text-gray-400">•</span>
                        <span>{displayTime(r.start_time)} – {displayTime(r.end_time)}</span>
                        {r.note ? <span className="mx-2 text-gray-400">•</span> : null}
                        {r.note ? <span className="text-gray-600 dark:text-gray-300">{r.note}</span> : null}
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => openEdit(r)}
                          className="px-2 py-1 rounded border border-orange-500/60 hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10 text-sm"
                        >
                          Bewerken
                        </button>
                        <button
                          onClick={() => remove(r)}
                          className="px-2 py-1 rounded border border-red-500/50 hover:border-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 text-sm"
                        >
                          Verwijderen
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
