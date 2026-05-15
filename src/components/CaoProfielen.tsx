'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface CaoProfiel {
  id: string
  naam: string
  vakantiegeld_pct: number
  pensioen_pct: number
  ziekteverzuim_pct: number
  overige_opslagen_pct: number
  toelichting: string | null
}

const leeg: Omit<CaoProfiel, 'id'> = {
  naam: '',
  vakantiegeld_pct: 8,
  pensioen_pct: 0,
  ziekteverzuim_pct: 0,
  overige_opslagen_pct: 0,
  toelichting: '',
}

export default function CaoProfielen() {
  const [profielen, setProfielen] = useState<CaoProfiel[]>([])
  const [loading, setLoading] = useState(true)
  const [bewerken, setBewerken] = useState<string | null>(null)
  const [formulier, setFormulier] = useState<Omit<CaoProfiel, 'id'>>(leeg)
  const [nieuw, setNieuw] = useState(false)
  const [opslaan, setOpslaan] = useState(false)

  const totaalOpslag = (p: Omit<CaoProfiel, 'id'>) =>
    p.vakantiegeld_pct + p.pensioen_pct + p.ziekteverzuim_pct + p.overige_opslagen_pct

  const laad = async () => {
    setLoading(true)
    const { data } = await supabase.from('cao_profiles').select('*').order('naam')
    setProfielen(data ?? [])
    setLoading(false)
  }

  useEffect(() => { laad() }, [])

  const startBewerken = (p: CaoProfiel) => {
    setBewerken(p.id)
    setFormulier({ naam: p.naam, vakantiegeld_pct: p.vakantiegeld_pct, pensioen_pct: p.pensioen_pct, ziekteverzuim_pct: p.ziekteverzuim_pct, overige_opslagen_pct: p.overige_opslagen_pct, toelichting: p.toelichting })
    setNieuw(false)
  }

  const startNieuw = () => {
    setFormulier(leeg)
    setNieuw(true)
    setBewerken(null)
  }

  const annuleer = () => { setBewerken(null); setNieuw(false) }

  const slaOp = async () => {
    if (!formulier.naam.trim()) return
    setOpslaan(true)
    if (nieuw) {
      await supabase.from('cao_profiles').insert(formulier)
    } else {
      await supabase.from('cao_profiles').update(formulier).eq('id', bewerken)
    }
    await laad()
    setBewerken(null)
    setNieuw(false)
    setOpslaan(false)
  }

  const verwijder = async (id: string) => {
    if (!confirm('CAO profiel verwijderen?')) return
    await supabase.from('cao_profiles').delete().eq('id', id)
    await laad()
  }

  const veld = (label: string, key: keyof Omit<CaoProfiel, 'id'>, type = 'number') => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        step="0.01"
        value={formulier[key] as string | number}
        onChange={e => setFormulier(prev => ({ ...prev, [key]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value }))}
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
      />
    </div>
  )

  if (loading) return <p className="p-6">Laden…</p>

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">CAO Profielen</h1>
        <button onClick={startNieuw} className="bg-black text-white px-4 py-2 rounded text-sm">+ Nieuw profiel</button>
      </div>

      {(nieuw || bewerken) && (
        <div className="border rounded-xl p-6 bg-gray-50 space-y-4">
          <h2 className="font-semibold text-lg">{nieuw ? 'Nieuw CAO profiel' : 'Bewerken'}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              {veld('Naam CAO', 'naam', 'text')}
            </div>
            {veld('Vakantiegeld %', 'vakantiegeld_pct')}
            {veld('Pensioen werkgever %', 'pensioen_pct')}
            {veld('Ziekteverzuim opslag %', 'ziekteverzuim_pct')}
            {veld('Overige opslagen %', 'overige_opslagen_pct')}
            <div className="md:col-span-2">
              {veld('Toelichting', 'toelichting', 'text')}
            </div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm">
            <strong>Totale opslag:</strong> {totaalOpslag(formulier).toFixed(2)}% boven op het basistarief
          </div>
          <div className="flex gap-2">
            <button onClick={slaOp} disabled={opslaan} className="bg-black text-white px-4 py-2 rounded text-sm disabled:opacity-50">
              {opslaan ? 'Opslaan…' : 'Opslaan'}
            </button>
            <button onClick={annuleer} className="border px-4 py-2 rounded text-sm">Annuleren</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {profielen.map(p => {
          const totaal = p.vakantiegeld_pct + p.pensioen_pct + p.ziekteverzuim_pct + p.overige_opslagen_pct
          return (
            <div key={p.id} className="border rounded-xl p-4 bg-white">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-base">{p.naam}</h3>
                  {p.toelichting && <p className="text-sm text-gray-500 mt-0.5">{p.toelichting}</p>}
                  <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-600">
                    <span>Vakantiegeld: <strong>{p.vakantiegeld_pct}%</strong></span>
                    <span>Pensioen: <strong>{p.pensioen_pct}%</strong></span>
                    <span>Ziekteverzuim: <strong>{p.ziekteverzuim_pct}%</strong></span>
                    <span>Overig: <strong>{p.overige_opslagen_pct}%</strong></span>
                    <span className="text-blue-700 font-semibold">Totaal: +{totaal.toFixed(2)}%</span>
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <button onClick={() => startBewerken(p)} className="text-sm border px-3 py-1 rounded hover:bg-gray-50">Bewerken</button>
                  <button onClick={() => verwijder(p.id)} className="text-sm border border-red-300 text-red-600 px-3 py-1 rounded hover:bg-red-50">Verwijder</button>
                </div>
              </div>
            </div>
          )
        })}
        {profielen.length === 0 && <p className="text-gray-500 text-sm">Nog geen CAO profielen. Voeg er een toe.</p>}
      </div>
    </div>
  )
}
