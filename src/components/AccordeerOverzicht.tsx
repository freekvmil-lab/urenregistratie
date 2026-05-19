'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

interface TimeEntry {
  id: number
  user_id: string
  date: string
  start_time: string | null
  end_time: string | null
  approved: boolean
  client_id: string | null
  client: string | null
  break_minutes: number
}

interface Profile { id: string; name: string | null; email: string | null }
interface Client { id: string; name: string }
interface MoneybirdContact { id: string; company_name: string | null; firstname: string | null; lastname: string | null }

const MAANDEN = ['Januari','Februari','Maart','April','Mei','Juni','Juli','Augustus','September','Oktober','November','December']
const nu = new Date()

function urenBerekenen(e: TimeEntry): number {
  if (!e.start_time || !e.end_time) return 0
  const start = new Date(e.start_time)
  const end = new Date(e.end_time)
  const minuten = (end.getTime() - start.getTime()) / 60000 - (e.break_minutes ?? 0)
  return Math.max(0, minuten / 60)
}

export default function AccordeerOverzicht() {
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [profielen, setProfielen] = useState<Profile[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [mbContacten, setMbContacten] = useState<MoneybirdContact[]>([])
  const [loading, setLoading] = useState(true)
  const [filterMaand, setFilterMaand] = useState(nu.getMonth() + 1)
  const [filterJaar, setFilterJaar] = useState(nu.getFullYear())
  const [geselecteerd, setGeselecteerd] = useState<Record<number, boolean>>({})
  const [versturen, setVersturen] = useState<string | null>(null)
  const [mbContactId, setMbContactId] = useState<Record<string, string>>({})
  const [resultaat, setResultaat] = useState<Record<string, { url: string; factuurId: string }>>({})
  const [bezig, setBezig] = useState(false)

  const laad = useCallback(async () => {
    setLoading(true)
    const vanDatum = `${filterJaar}-${String(filterMaand).padStart(2,'0')}-01`
    const totDatum = `${filterJaar}-${String(filterMaand).padStart(2,'0')}-31`

    const [{ data: e }, { data: p }, { data: c }] = await Promise.all([
      supabase.from('time_entries').select('id, user_id, date, start_time, end_time, approved, client_id, client, break_minutes')
        .gte('date', vanDatum).lte('date', totDatum).order('date'),
      supabase.from('profiles').select('id, name, email').is('deleted_at', null),
      supabase.from('clients').select('id, name').order('name'),
    ])

    setEntries(e ?? [])
    setProfielen(p ?? [])
    setClients(c ?? [])
    setLoading(false)

    // Haal Moneybird contacten op
    fetch('/api/admin/moneybird').then(r => r.json()).then(d => {
      setMbContacten(d.contacten ?? [])
    })
  }, [filterMaand, filterJaar])

  useEffect(() => { laad() }, [laad])

  const profielNaam = (id: string) => profielen.find(p => p.id === id)?.name ?? id
  const clientNaam = (e: TimeEntry) => {
    if (e.client_id) return clients.find(c => c.id === e.client_id)?.name ?? e.client ?? 'Onbekend'
    return e.client ?? 'Geen opdrachtgever'
  }

  // Groepeer per opdrachtgever
  const perClient: Record<string, TimeEntry[]> = {}
  for (const e of entries) {
    const key = e.client_id ?? e.client ?? '__geen__'
    if (!perClient[key]) perClient[key] = []
    perClient[key].push(e)
  }

  const toggleEntry = (id: number) => setGeselecteerd(prev => ({ ...prev, [id]: !prev[id] }))
  const selecteerAlles = (ids: number[]) => setGeselecteerd(prev => { const n = { ...prev }; ids.forEach(id => n[id] = true); return n })
  const deselecteerAlles = (ids: number[]) => setGeselecteerd(prev => { const n = { ...prev }; ids.forEach(id => delete n[id]); return n })

  const accordeerGroep = async (ids: number[]) => {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('time_entries').update({
      approved: true,
      approved_at: new Date().toISOString(),
      approved_by: user?.id ?? null,
    }).in('id', ids)
    await laad()
  }

  const stuurNaarMoneybird = async (clientKey: string, ids: number[]) => {
    setBezig(true)
    const contactId = mbContactId[clientKey] ?? null
    const res = await fetch('/api/admin/moneybird', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entry_ids: ids,
        contact_id: contactId,
        maand: filterMaand,
        jaar: filterJaar,
      }),
    })
    const data = await res.json()
    if (data.ok) {
      setResultaat(prev => ({ ...prev, [clientKey]: { url: data.factuur_url, factuurId: data.factuur_id } }))
    } else {
      alert('Fout: ' + (data.error ?? 'Onbekende fout'))
    }
    setBezig(false)
  }

  const fmt = (u: number) => u.toFixed(1) + 'u'

  if (loading) return <p className="p-6">Laden…</p>

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Uren accorderen</h1>
        <div className="flex gap-2">
          <select value={filterMaand} onChange={e => setFilterMaand(Number(e.target.value))} className="rounded border px-2 py-1.5 text-sm">
            {MAANDEN.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
          </select>
          <select value={filterJaar} onChange={e => setFilterJaar(Number(e.target.value))} className="rounded border px-2 py-1.5 text-sm">
            {[2024,2025,2026,2027].map(j => <option key={j} value={j}>{j}</option>)}
          </select>
        </div>
      </div>

      {Object.entries(perClient).map(([clientKey, clientEntries]) => {
        const naam = clientEntries[0] ? clientNaam(clientEntries[0]) : 'Onbekend'
        const pending = clientEntries.filter(e => !e.approved)
        const goedgekeurd = clientEntries.filter(e => e.approved)
        const totaalUren = clientEntries.reduce((s, e) => s + urenBerekenen(e), 0)
        const pendingUren = pending.reduce((s, e) => s + urenBerekenen(e), 0)
        const mbContact = mbContacten.find(c => c.id === mbContactId[clientKey])
        const res = resultaat[clientKey]

        return (
          <div key={clientKey} className="border rounded-xl overflow-hidden bg-white">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
              <div>
                <h2 className="font-bold text-base">{naam}</h2>
                <p className="text-xs text-gray-500">
                  {fmt(totaalUren)} totaal · {fmt(pendingUren)} te accorderen · {goedgekeurd.length} goedgekeurd
                </p>
              </div>
              <div className="flex gap-2 flex-wrap justify-end">
                {pending.length > 0 && (
                  <button onClick={() => accordeerGroep(pending.map(e => e.id))}
                    className="text-sm bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700">
                    ✓ Alles accorderen ({pending.length})
                  </button>
                )}
                {goedgekeurd.length > 0 && !res && (
                  <button onClick={() => setVersturen(versturen === clientKey ? null : clientKey)}
                    className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700">
                    📤 Naar Moneybird
                  </button>
                )}
                {res && (
                  <a href={res.url} target="_blank" rel="noopener noreferrer"
                    className="text-sm bg-green-100 text-green-800 border border-green-300 px-3 py-1.5 rounded">
                    ✅ Factuur aangemaakt →
                  </a>
                )}
              </div>
            </div>

            {/* Moneybird contact koppelen */}
            {versturen === clientKey && !res && (
              <div className="px-4 py-3 bg-blue-50 border-b flex items-center gap-3 flex-wrap">
                <span className="text-sm font-medium">Moneybird contact:</span>
                <select
                  value={mbContactId[clientKey] ?? ''}
                  onChange={e => setMbContactId(prev => ({ ...prev, [clientKey]: e.target.value }))}
                  className="rounded border px-2 py-1.5 text-sm flex-1 min-w-48"
                >
                  <option value="">Kies contact…</option>
                  {mbContacten.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.company_name ?? `${c.firstname ?? ''} ${c.lastname ?? ''}`.trim()}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => stuurNaarMoneybird(clientKey, goedgekeurd.map(e => e.id))}
                  disabled={bezig}
                  className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded disabled:opacity-50"
                >
                  {bezig ? 'Bezig…' : `Verstuur ${fmt(goedgekeurd.reduce((s,e) => s + urenBerekenen(e), 0))}`}
                </button>
              </div>
            )}

            {/* Uren lijst */}
            <div className="divide-y">
              {clientEntries.map(e => {
                const uren = urenBerekenen(e)
                return (
                  <div key={e.id} className={`flex items-center gap-3 px-4 py-2 text-sm ${e.approved ? 'opacity-60' : ''}`}>
                    <input type="checkbox" checked={!!geselecteerd[e.id]} onChange={() => toggleEntry(e.id)}
                      className="rounded" />
                    <span className="w-24 text-gray-500">{e.date}</span>
                    <span className="flex-1">{profielNaam(e.user_id)}</span>
                    <span className="text-gray-600">{e.start_time?.slice(0,5) ?? '?'} – {e.end_time?.slice(0,5) ?? '?'}</span>
                    <span className="w-12 text-right font-medium">{fmt(uren)}</span>
                    {e.approved
                      ? <span className="text-xs text-green-600 font-medium w-24 text-right">✓ Akkoord</span>
                      : <button onClick={() => accordeerGroep([e.id])}
                          className="text-xs border border-green-400 text-green-700 px-2 py-0.5 rounded hover:bg-green-50 w-24 text-center">
                          Accordeer
                        </button>
                    }
                  </div>
                )
              })}
            </div>

            {/* Selectie acties */}
            {Object.values(geselecteerd).some(Boolean) && (
              <div className="px-4 py-2 bg-gray-50 border-t flex gap-2">
                <button onClick={() => accordeerGroep(Object.entries(geselecteerd).filter(([,v]) => v).map(([k]) => Number(k)))}
                  className="text-sm bg-green-600 text-white px-3 py-1.5 rounded">
                  ✓ Geselecteerde accorderen
                </button>
                <button onClick={() => setGeselecteerd({})} className="text-sm border px-3 py-1.5 rounded">
                  Deselecteer
                </button>
              </div>
            )}
          </div>
        )
      })}

      {Object.keys(perClient).length === 0 && (
        <p className="text-gray-400 text-center py-12">Geen uren gevonden voor {MAANDEN[filterMaand-1]} {filterJaar}</p>
      )}
    </div>
  )
}
