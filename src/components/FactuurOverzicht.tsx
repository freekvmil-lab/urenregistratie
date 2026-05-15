'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

interface Profiel { id: string; name: string | null; email: string | null; hourly_rate: number | null; cao_profile_id: string | null }
interface Client { id: string; name: string }
interface CaoProfiel { id: string; naam: string; vakantiegeld_pct: number; pensioen_pct: number; ziekteverzuim_pct: number; overige_opslagen_pct: number }

interface Regel {
  id: string
  jaar: number
  maand: number
  week: number
  opdrachtgever_id: string | null
  opdrachtgever_naam: string | null
  medewerker_id: string | null
  medewerker_naam: string | null
  type_dienst: 'uren' | 'dag'
  uren: number | null
  dagen: number | null
  kilometers: number | null
  extra_info_1: string | null
  extra_info_2: string | null
  inkoop_uurtarief: number | null
  inkoop_dagtarief: number | null
  inkoop_km_tarief: number | null
  inkoop_totaal: number | null
  verkoop_uurtarief: number | null
  verkoop_dagtarief: number | null
  verkoop_km_tarief: number | null
  verkoop_totaal: number | null
  betaald: boolean
  notities: string | null
}

const MAANDEN = ['Januari','Februari','Maart','April','Mei','Juni','Juli','Augustus','September','Oktober','November','December']
const nu = new Date()

const legeRegel = (): Omit<Regel, 'id' | 'inkoop_totaal' | 'verkoop_totaal'> => ({
  jaar: nu.getFullYear(),
  maand: nu.getMonth() + 1,
  week: 1,
  opdrachtgever_id: null,
  opdrachtgever_naam: null,
  medewerker_id: null,
  medewerker_naam: null,
  type_dienst: 'uren',
  uren: null,
  dagen: null,
  kilometers: 0,
  extra_info_1: null,
  extra_info_2: null,
  inkoop_uurtarief: null,
  inkoop_dagtarief: null,
  inkoop_km_tarief: 0.19,
  verkoop_uurtarief: null,
  verkoop_dagtarief: null,
  verkoop_km_tarief: 0.23,
  betaald: false,
  notities: null,
})

const fmt = (n: number | null | undefined) =>
  n == null ? '—' : '€ ' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')

export default function FactuurOverzicht() {
  const [regels, setRegels] = useState<Regel[]>([])
  const [profielen, setProfielen] = useState<Profiel[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [caoProfielen, setCaoProfielen] = useState<CaoProfiel[]>([])
  const [loading, setLoading] = useState(true)
  const [filterMaand, setFilterMaand] = useState(nu.getMonth() + 1)
  const [filterJaar, setFilterJaar] = useState(nu.getFullYear())
  const [nieuw, setNieuw] = useState(false)
  const [formulier, setFormulier] = useState(legeRegel())
  const [opslaan, setOpslaan] = useState(false)
  const [bewerken, setBewerken] = useState<string | null>(null)

  const laad = useCallback(async () => {
    setLoading(true)
    const [{ data: r }, { data: p }, { data: c }, { data: cao }] = await Promise.all([
      supabase.from('factuur_regels').select('*').eq('jaar', filterJaar).eq('maand', filterMaand).order('week').order('created_at'),
      supabase.from('profiles').select('id, name, email, hourly_rate, cao_profile_id').is('deleted_at', null).order('name'),
      supabase.from('clients').select('id, name').order('name'),
      supabase.from('cao_profiles').select('*'),
    ])
    setRegels(r ?? [])
    setProfielen(p ?? [])
    setClients(c ?? [])
    setCaoProfielen(cao ?? [])
    setLoading(false)
  }, [filterJaar, filterMaand])

  useEffect(() => { laad() }, [laad])

  const selecteerMedewerker = (id: string) => {
    const p = profielen.find(x => x.id === id)
    if (!p) return
    const cao = caoProfielen.find(c => c.id === p.cao_profile_id)
    const opslag = cao ? (1 + (cao.vakantiegeld_pct + cao.pensioen_pct + cao.ziekteverzuim_pct + cao.overige_opslagen_pct) / 100) : 1
    const basisTarief = p.hourly_rate ?? null
    const inkoop = basisTarief ? Math.round(basisTarief * opslag * 100) / 100 : null
    setFormulier(prev => ({
      ...prev,
      medewerker_id: id,
      medewerker_naam: p.name ?? p.email ?? '',
      inkoop_uurtarief: inkoop,
      inkoop_dagtarief: inkoop ? Math.round(inkoop * 8 * 100) / 100 : null,
    }))
  }

  const selecteerOpdrachtgever = (id: string) => {
    const c = clients.find(x => x.id === id)
    setFormulier(prev => ({ ...prev, opdrachtgever_id: id, opdrachtgever_naam: c?.name ?? '' }))
  }

  const berekenInkoop = (f: typeof formulier) => {
    if (f.type_dienst === 'uren') return (f.uren ?? 0) * (f.inkoop_uurtarief ?? 0) + (f.kilometers ?? 0) * (f.inkoop_km_tarief ?? 0)
    return (f.dagen ?? 0) * (f.inkoop_dagtarief ?? 0) + (f.kilometers ?? 0) * (f.inkoop_km_tarief ?? 0)
  }

  const berekenVerkoop = (f: typeof formulier) => {
    if (f.type_dienst === 'uren') return (f.uren ?? 0) * (f.verkoop_uurtarief ?? 0) + (f.kilometers ?? 0) * (f.verkoop_km_tarief ?? 0)
    return (f.dagen ?? 0) * (f.verkoop_dagtarief ?? 0) + (f.kilometers ?? 0) * (f.verkoop_km_tarief ?? 0)
  }

  const slaOp = async () => {
    setOpslaan(true)
    const data = { ...formulier }
    if (bewerken) {
      await supabase.from('factuur_regels').update(data).eq('id', bewerken)
    } else {
      await supabase.from('factuur_regels').insert(data)
    }
    await laad()
    setNieuw(false)
    setBewerken(null)
    setFormulier(legeRegel())
    setOpslaan(false)
  }

  const startBewerken = (r: Regel) => {
    setBewerken(r.id)
    setFormulier({ ...r })
    setNieuw(true)
  }

  const verwijder = async (id: string) => {
    if (!confirm('Regel verwijderen?')) return
    await supabase.from('factuur_regels').delete().eq('id', id)
    await laad()
  }

  // Totalen per opdrachtgever
  const totalen = regels.reduce((acc, r) => {
    const naam = r.opdrachtgever_naam ?? 'Onbekend'
    if (!acc[naam]) acc[naam] = { inkoop: 0, verkoop: 0, winst: 0 }
    acc[naam].inkoop += r.inkoop_totaal ?? 0
    acc[naam].verkoop += r.verkoop_totaal ?? 0
    acc[naam].winst += (r.verkoop_totaal ?? 0) - (r.inkoop_totaal ?? 0)
    return acc
  }, {} as Record<string, { inkoop: number; verkoop: number; winst: number }>)

  const totalenAlles = {
    inkoop: regels.reduce((s, r) => s + (r.inkoop_totaal ?? 0), 0),
    verkoop: regels.reduce((s, r) => s + (r.verkoop_totaal ?? 0), 0),
    winst: regels.reduce((s, r) => s + ((r.verkoop_totaal ?? 0) - (r.inkoop_totaal ?? 0)), 0),
  }

  const inp = (label: string, key: keyof typeof formulier, type = 'text') => (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <input type={type} step="0.01"
        value={(formulier[key] as string | number) ?? ''}
        onChange={e => setFormulier(prev => ({ ...prev, [key]: type === 'number' ? (parseFloat(e.target.value) || null) : (e.target.value || null) }))}
        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
      />
    </div>
  )

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Factuuroverzicht</h1>
        <div className="flex gap-2 items-center">
          <select value={filterMaand} onChange={e => setFilterMaand(Number(e.target.value))} className="rounded border px-2 py-1.5 text-sm">
            {MAANDEN.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={filterJaar} onChange={e => setFilterJaar(Number(e.target.value))} className="rounded border px-2 py-1.5 text-sm">
            {[2024, 2025, 2026, 2027].map(j => <option key={j} value={j}>{j}</option>)}
          </select>
          <button onClick={() => { setNieuw(true); setBewerken(null); setFormulier(legeRegel()) }} className="bg-black text-white px-3 py-1.5 rounded text-sm">+ Regel toevoegen</button>
        </div>
      </div>

      {/* Totalen per opdrachtgever */}
      {Object.keys(totalen).length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.entries(totalen).map(([naam, t]) => (
            <div key={naam} className="border rounded-xl p-4 bg-white">
              <p className="font-semibold text-sm mb-2">{naam}</p>
              <div className="text-xs space-y-1">
                <div className="flex justify-between"><span className="text-gray-500">Inkoop</span><span>{fmt(t.inkoop)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Verkoop</span><span>{fmt(t.verkoop)}</span></div>
                <div className="flex justify-between font-semibold border-t pt-1 mt-1">
                  <span>Winst</span>
                  <span className={t.winst >= 0 ? 'text-green-600' : 'text-red-600'}>{fmt(t.winst)}</span>
                </div>
              </div>
            </div>
          ))}
          <div className="border-2 border-black rounded-xl p-4 bg-gray-50">
            <p className="font-bold text-sm mb-2">Totaal {MAANDEN[filterMaand - 1]}</p>
            <div className="text-xs space-y-1">
              <div className="flex justify-between"><span className="text-gray-500">Inkoop</span><span>{fmt(totalenAlles.inkoop)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Verkoop</span><span>{fmt(totalenAlles.verkoop)}</span></div>
              <div className="flex justify-between font-bold border-t pt-1 mt-1">
                <span>Winst</span>
                <span className={totalenAlles.winst >= 0 ? 'text-green-600' : 'text-red-600'}>{fmt(totalenAlles.winst)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Formulier */}
      {nieuw && (
        <div className="border rounded-xl p-5 bg-gray-50 space-y-4">
          <h2 className="font-semibold">{bewerken ? 'Regel bewerken' : 'Nieuwe regel'}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Maand</label>
              <select value={formulier.maand} onChange={e => setFormulier(p => ({ ...p, maand: Number(e.target.value) }))} className="w-full rounded border px-2 py-1.5 text-sm">
                {MAANDEN.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
            {inp('Jaar', 'jaar', 'number')}
            {inp('Week', 'week', 'number')}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Type</label>
              <select value={formulier.type_dienst} onChange={e => setFormulier(p => ({ ...p, type_dienst: e.target.value as 'uren' | 'dag' }))} className="w-full rounded border px-2 py-1.5 text-sm">
                <option value="uren">Uren</option>
                <option value="dag">Dagtarief</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Opdrachtgever</label>
              <select value={formulier.opdrachtgever_id ?? ''} onChange={e => selecteerOpdrachtgever(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm">
                <option value="">Kies opdrachtgever…</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Medewerker</label>
              <select value={formulier.medewerker_id ?? ''} onChange={e => selecteerMedewerker(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm">
                <option value="">Kies medewerker…</option>
                {profielen.map(p => <option key={p.id} value={p.id}>{p.name ?? p.email}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {formulier.type_dienst === 'uren' ? inp('Uren', 'uren', 'number') : inp('Dagen', 'dagen', 'number')}
            {inp('Kilometers', 'kilometers', 'number')}
            {inp('Extra info 1', 'extra_info_1')}
            {inp('Extra info 2', 'extra_info_2')}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-red-50 border border-red-100 rounded-lg p-3">
            <p className="col-span-full text-xs font-semibold text-red-700">Inkoop (wat jij betaalt)</p>
            {formulier.type_dienst === 'uren' ? inp('Uurtarief inkoop', 'inkoop_uurtarief', 'number') : inp('Dagtarief inkoop', 'inkoop_dagtarief', 'number')}
            {inp('KM tarief inkoop', 'inkoop_km_tarief', 'number')}
            <div className="flex items-end pb-1"><span className="text-sm font-semibold">{fmt(berekenInkoop(formulier))}</span></div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-green-50 border border-green-100 rounded-lg p-3">
            <p className="col-span-full text-xs font-semibold text-green-700">Verkoop (wat jij factureert)</p>
            {formulier.type_dienst === 'uren' ? inp('Uurtarief verkoop', 'verkoop_uurtarief', 'number') : inp('Dagtarief verkoop', 'verkoop_dagtarief', 'number')}
            {inp('KM tarief verkoop', 'verkoop_km_tarief', 'number')}
            <div className="flex items-end pb-1"><span className="text-sm font-semibold">{fmt(berekenVerkoop(formulier))}</span></div>
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm">
            <span className="font-semibold">Winst op deze regel: </span>
            <span className={berekenVerkoop(formulier) - berekenInkoop(formulier) >= 0 ? 'text-green-700 font-bold' : 'text-red-700 font-bold'}>
              {fmt(berekenVerkoop(formulier) - berekenInkoop(formulier))}
            </span>
          </div>

          <div className="flex gap-2">
            <button onClick={slaOp} disabled={opslaan} className="bg-black text-white px-4 py-2 rounded text-sm disabled:opacity-50">{opslaan ? 'Opslaan…' : 'Opslaan'}</button>
            <button onClick={() => { setNieuw(false); setBewerken(null) }} className="border px-4 py-2 rounded text-sm">Annuleren</button>
          </div>
        </div>
      )}

      {/* Regeloverzicht */}
      {loading ? <p>Laden…</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100 text-left">
                <th className="p-2 border">W</th>
                <th className="p-2 border">Opdrachtgever</th>
                <th className="p-2 border">Medewerker</th>
                <th className="p-2 border">Uren/Dag</th>
                <th className="p-2 border">KM</th>
                <th className="p-2 border text-red-700">Inkoop</th>
                <th className="p-2 border text-green-700">Verkoop</th>
                <th className="p-2 border">Winst</th>
                <th className="p-2 border"></th>
              </tr>
            </thead>
            <tbody>
              {regels.map(r => {
                const winst = (r.verkoop_totaal ?? 0) - (r.inkoop_totaal ?? 0)
                return (
                  <tr key={r.id} className="hover:bg-gray-50 border-b">
                    <td className="p-2 border">{r.week}</td>
                    <td className="p-2 border">{r.opdrachtgever_naam ?? '—'}</td>
                    <td className="p-2 border">{r.medewerker_naam ?? '—'}</td>
                    <td className="p-2 border">{r.type_dienst === 'uren' ? `${r.uren ?? 0}u` : `${r.dagen ?? 0}d`}</td>
                    <td className="p-2 border">{r.kilometers ?? 0}</td>
                    <td className="p-2 border text-red-700">{fmt(r.inkoop_totaal)}</td>
                    <td className="p-2 border text-green-700">{fmt(r.verkoop_totaal)}</td>
                    <td className={`p-2 border font-semibold ${winst >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(winst)}</td>
                    <td className="p-2 border">
                      <div className="flex gap-1">
                        <button onClick={() => startBewerken(r)} className="text-xs border px-2 py-1 rounded hover:bg-gray-100">✏️</button>
                        <button onClick={() => verwijder(r.id)} className="text-xs border border-red-200 text-red-600 px-2 py-1 rounded hover:bg-red-50">🗑</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {regels.length === 0 && (
                <tr><td colSpan={9} className="p-4 text-center text-gray-400">Geen regels voor {MAANDEN[filterMaand - 1]} {filterJaar}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
