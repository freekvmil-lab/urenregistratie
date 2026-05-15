'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useSearchParams } from 'next/navigation'

interface Profiel { id: string; name: string | null; email: string | null }
interface Client { id: string; name: string }

interface Planning {
  id: string
  titel: string
  datum: string
  start_tijd: string
  eind_tijd: string
  locatie: string | null
  opdrachtgever_id: string | null
  opdrachtgever_naam: string | null
  notities: string | null
  google_event_id: string | null
  planning_medewerkers: { medewerker_id: string; medewerker_naam: string | null; status: string }[]
}

const leeg = {
  titel: '',
  datum: new Date().toISOString().split('T')[0],
  start_tijd: '08:00',
  eind_tijd: '17:00',
  locatie: '',
  opdrachtgever_id: '',
  notities: '',
  medewerker_ids: [] as string[],
}

export default function PlanningBeheer() {
  const searchParams = useSearchParams()
  const [planning, setPlanning] = useState<Planning[]>([])
  const [profielen, setProfielen] = useState<Profiel[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [nieuw, setNieuw] = useState(false)
  const [formulier, setFormulier] = useState(leeg)
  const [opslaan, setOpslaan] = useState(false)
  const [googleVerbonden, setGoogleVerbonden] = useState(false)
  const [melding, setMelding] = useState<string | null>(null)
  const [filterDatum, setFilterDatum] = useState(new Date().toISOString().split('T')[0].slice(0, 7))

  const laad = useCallback(async () => {
    setLoading(true)
    const [jaar, maand] = filterDatum.split('-')
    const vanDatum = `${jaar}-${maand}-01`
    const totDatum = `${jaar}-${maand}-31`

    const [{ data: p }, { data: c }, { data: pl }, { data: tokens }] = await Promise.all([
      supabase.from('profiles').select('id, name, email').is('deleted_at', null).order('name'),
      supabase.from('clients').select('id, name').order('name'),
      supabase.from('planning').select('*, planning_medewerkers(medewerker_id, medewerker_naam, status)')
        .gte('datum', vanDatum).lte('datum', totDatum).order('datum').order('start_tijd'),
      supabase.from('google_tokens').select('user_id').limit(1),
    ])
    setProfielen(p ?? [])
    setClients(c ?? [])
    setPlanning(pl ?? [])
    setGoogleVerbonden((tokens?.length ?? 0) > 0)
    setLoading(false)
  }, [filterDatum])

  useEffect(() => { laad() }, [laad])

  useEffect(() => {
    if (searchParams.get('connected') === '1') setMelding('✅ Google Agenda gekoppeld!')
    if (searchParams.get('error')) setMelding('❌ Google koppeling mislukt: ' + searchParams.get('error'))
  }, [searchParams])

  const toggleMedewerker = (id: string) => {
    setFormulier(prev => ({
      ...prev,
      medewerker_ids: prev.medewerker_ids.includes(id)
        ? prev.medewerker_ids.filter(x => x !== id)
        : [...prev.medewerker_ids, id]
    }))
  }

  const slaOp = async () => {
    if (!formulier.titel || !formulier.datum) return
    setOpslaan(true)

    const client = clients.find(c => c.id === formulier.opdrachtgever_id)

    const { data: nieuwePlanning, error } = await supabase.from('planning').insert({
      titel: formulier.titel,
      datum: formulier.datum,
      start_tijd: formulier.start_tijd,
      eind_tijd: formulier.eind_tijd,
      locatie: formulier.locatie || null,
      opdrachtgever_id: formulier.opdrachtgever_id || null,
      opdrachtgever_naam: client?.name ?? null,
      notities: formulier.notities || null,
    }).select().single()

    if (error || !nieuwePlanning) {
      setOpslaan(false)
      return
    }

    // Medewerkers koppelen
    if (formulier.medewerker_ids.length > 0) {
      const medewerkerRows = formulier.medewerker_ids.map(id => {
        const p = profielen.find(x => x.id === id)
        return { planning_id: nieuwePlanning.id, medewerker_id: id, medewerker_naam: p?.name ?? p?.email ?? '' }
      })
      await supabase.from('planning_medewerkers').insert(medewerkerRows)
    }

    // Google Agenda event aanmaken
    if (googleVerbonden) {
      await fetch('/api/google/create-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planning_id: nieuwePlanning.id }),
      })
    }

    await laad()
    setNieuw(false)
    setFormulier(leeg)
    setOpslaan(false)
    setMelding('✅ Dienst aangemaakt' + (googleVerbonden ? ' + Google Agenda bijgewerkt' : ''))
    setTimeout(() => setMelding(null), 4000)
  }

  const verwijder = async (id: string) => {
    if (!confirm('Dienst verwijderen?')) return
    await supabase.from('planning').delete().eq('id', id)
    await laad()
  }

  const dagNamen = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za']

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Planning</h1>
        <div className="flex gap-2 items-center flex-wrap">
          <input type="month" value={filterDatum} onChange={e => setFilterDatum(e.target.value)}
            className="rounded border px-2 py-1.5 text-sm" />
          {!googleVerbonden ? (
            <a href="/api/google/auth" className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm">
              🔗 Google Agenda koppelen
            </a>
          ) : (
            <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded">✅ Google Agenda</span>
          )}
          <button onClick={() => setNieuw(true)} className="bg-black text-white px-3 py-1.5 rounded text-sm">+ Dienst aanmaken</button>
        </div>
      </div>

      {melding && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">{melding}</div>
      )}

      {/* Nieuw formulier */}
      {nieuw && (
        <div className="border rounded-xl p-5 bg-gray-50 space-y-4">
          <h2 className="font-semibold">Nieuwe dienst</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Titel</label>
              <input type="text" value={formulier.titel}
                onChange={e => setFormulier(p => ({ ...p, titel: e.target.value }))}
                placeholder="bijv. Beurs RAI Amsterdam"
                className="w-full rounded border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Datum</label>
              <input type="date" value={formulier.datum}
                onChange={e => setFormulier(p => ({ ...p, datum: e.target.value }))}
                className="w-full rounded border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Opdrachtgever</label>
              <select value={formulier.opdrachtgever_id}
                onChange={e => setFormulier(p => ({ ...p, opdrachtgever_id: e.target.value }))}
                className="w-full rounded border px-3 py-2 text-sm">
                <option value="">Kies opdrachtgever…</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Starttijd</label>
              <input type="time" value={formulier.start_tijd}
                onChange={e => setFormulier(p => ({ ...p, start_tijd: e.target.value }))}
                className="w-full rounded border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Eindtijd</label>
              <input type="time" value={formulier.eind_tijd}
                onChange={e => setFormulier(p => ({ ...p, eind_tijd: e.target.value }))}
                className="w-full rounded border px-3 py-2 text-sm" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Locatie</label>
              <input type="text" value={formulier.locatie}
                onChange={e => setFormulier(p => ({ ...p, locatie: e.target.value }))}
                placeholder="Adres of locatienaam"
                className="w-full rounded border px-3 py-2 text-sm" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Medewerkers</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {profielen.map(p => (
                  <button key={p.id} type="button"
                    onClick={() => toggleMedewerker(p.id)}
                    className={`px-3 py-1 rounded-full border text-sm transition ${formulier.medewerker_ids.includes(p.id) ? 'bg-black text-white border-black' : 'bg-white border-gray-300 hover:bg-gray-50'}`}>
                    {p.name ?? p.email}
                  </button>
                ))}
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Notities</label>
              <textarea value={formulier.notities}
                onChange={e => setFormulier(p => ({ ...p, notities: e.target.value }))}
                rows={2} className="w-full rounded border px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={slaOp} disabled={opslaan}
              className="bg-black text-white px-4 py-2 rounded text-sm disabled:opacity-50">
              {opslaan ? 'Opslaan…' : googleVerbonden ? '📅 Opslaan + Google Agenda' : 'Opslaan'}
            </button>
            <button onClick={() => setNieuw(false)} className="border px-4 py-2 rounded text-sm">Annuleren</button>
          </div>
        </div>
      )}

      {/* Overzicht */}
      {loading ? <p>Laden…</p> : (
        <div className="space-y-3">
          {planning.map(p => {
            const datum = new Date(p.datum + 'T00:00:00')
            return (
              <div key={p.id} className="border rounded-xl p-4 bg-white">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-4">
                    <div className="text-center min-w-10">
                      <p className="text-xs text-gray-400">{dagNamen[datum.getDay()]}</p>
                      <p className="text-2xl font-bold leading-none">{datum.getDate()}</p>
                    </div>
                    <div>
                      <p className="font-semibold">{p.titel}</p>
                      <p className="text-sm text-gray-500">{p.start_tijd.slice(0,5)} – {p.eind_tijd.slice(0,5)}{p.locatie ? ` · ${p.locatie}` : ''}{p.opdrachtgever_naam ? ` · ${p.opdrachtgever_naam}` : ''}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {p.planning_medewerkers.map(m => (
                          <span key={m.medewerker_id} className={`text-xs px-2 py-0.5 rounded-full border ${m.status === 'geaccepteerd' ? 'bg-green-50 border-green-200 text-green-700' : m.status === 'geweigerd' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-gray-50 border-gray-200'}`}>
                            {m.medewerker_naam ?? m.medewerker_id}
                          </span>
                        ))}
                      </div>
                      {p.google_event_id && <p className="text-xs text-blue-500 mt-1">📅 In Google Agenda</p>}
                    </div>
                  </div>
                  <button onClick={() => verwijder(p.id)} className="text-xs border border-red-200 text-red-600 px-2 py-1 rounded hover:bg-red-50 shrink-0">🗑</button>
                </div>
              </div>
            )
          })}
          {planning.length === 0 && <p className="text-gray-400 text-sm text-center py-8">Geen diensten gepland in deze maand.</p>}
        </div>
      )}
    </div>
  )
}
