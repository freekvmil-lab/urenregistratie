'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface CaoProfiel { id: string; naam: string }

interface Medewerker {
  id: string
  name: string | null
  email: string | null
  role: string
  type_medewerker: string
  telefoon: string | null
  bsn: string | null
  geboortedatum: string | null
  iban: string | null
  hourly_rate: number | null
  home_address: string | null
  cao_profile_id: string | null
  in_dienst_datum: string | null
  notities: string | null
  deleted_at: string | null
}

export default function PersoneelBeheer() {
  const [medewerkers, setMedewerkers] = useState<Medewerker[]>([])
  const [cao, setCao] = useState<CaoProfiel[]>([])
  const [loading, setLoading] = useState(true)
  const [geselecteerd, setGeselecteerd] = useState<Medewerker | null>(null)
  const [opslaan, setOpslaan] = useState(false)
  const [zoek, setZoek] = useState('')

  const laad = async () => {
    setLoading(true)
    const [{ data: md }, { data: cao_data }] = await Promise.all([
      supabase.from('profiles').select('*').is('deleted_at', null).order('name'),
      supabase.from('cao_profiles').select('id, naam').order('naam'),
    ])
    setMedewerkers(md ?? [])
    setCao(cao_data ?? [])
    setLoading(false)
  }

  useEffect(() => { laad() }, [])

  const selecteer = (m: Medewerker) => setGeselecteerd({ ...m })

  const wijzig = (key: keyof Medewerker, val: string | number | null) =>
    setGeselecteerd(prev => prev ? { ...prev, [key]: val } : prev)

  const slaOp = async () => {
    if (!geselecteerd) return
    setOpslaan(true)
    await supabase.from('profiles').update({
      name: geselecteerd.name,
      telefoon: geselecteerd.telefoon,
      bsn: geselecteerd.bsn,
      geboortedatum: geselecteerd.geboortedatum || null,
      iban: geselecteerd.iban,
      hourly_rate: geselecteerd.hourly_rate,
      home_address: geselecteerd.home_address,
      cao_profile_id: geselecteerd.cao_profile_id || null,
      type_medewerker: geselecteerd.type_medewerker,
      in_dienst_datum: geselecteerd.in_dienst_datum || null,
      notities: geselecteerd.notities,
    }).eq('id', geselecteerd.id)
    await laad()
    setGeselecteerd(null)
    setOpslaan(false)
  }

  const gefilterd = medewerkers.filter(m =>
    [m.name, m.email].some(v => v?.toLowerCase().includes(zoek.toLowerCase()))
  )

  const inp = (label: string, key: keyof Medewerker, type = 'text') => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        value={(geselecteerd?.[key] as string | number) ?? ''}
        onChange={e => wijzig(key, type === 'number' ? (parseFloat(e.target.value) || null) : e.target.value || null)}
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
      />
    </div>
  )

  if (loading) return <p className="p-6">Laden…</p>

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Personeel</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Lijst */}
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Zoek medewerker…"
            value={zoek}
            onChange={e => setZoek(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm mb-3"
          />
          {gefilterd.map(m => {
            const caoNaam = cao.find(c => c.id === m.cao_profile_id)?.naam
            return (
              <button
                key={m.id}
                onClick={() => selecteer(m)}
                className={`w-full text-left rounded-xl border p-3 transition ${geselecteerd?.id === m.id ? 'border-black bg-gray-50' : 'hover:bg-gray-50'}`}
              >
                <p className="font-medium text-sm">{m.name ?? m.email}</p>
                <p className="text-xs text-gray-500">{m.type_medewerker} · {caoNaam ?? 'Geen CAO'}</p>
                <p className="text-xs text-gray-400">{m.email}</p>
              </button>
            )
          })}
          {gefilterd.length === 0 && <p className="text-sm text-gray-400">Geen medewerkers gevonden.</p>}
        </div>

        {/* Detail formulier */}
        <div className="md:col-span-2">
          {geselecteerd ? (
            <div className="border rounded-xl p-6 space-y-4">
              <h2 className="font-semibold text-lg">{geselecteerd.name ?? geselecteerd.email}</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {inp('Naam', 'name')}
                {inp('E-mail', 'email')}
                {inp('Telefoon', 'telefoon')}
                {inp('BSN', 'bsn')}
                {inp('Geboortedatum', 'geboortedatum', 'date')}
                {inp('IBAN', 'iban')}
                {inp('Thuisadres', 'home_address')}
                {inp('In dienst datum', 'in_dienst_datum', 'date')}
                {inp('Uurtarief (inkoop)', 'hourly_rate', 'number')}

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                  <select
                    value={geselecteerd.type_medewerker}
                    onChange={e => wijzig('type_medewerker', e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="personeel">Personeel</option>
                    <option value="zzp">ZZP</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">CAO Profiel</label>
                  <select
                    value={geselecteerd.cao_profile_id ?? ''}
                    onChange={e => wijzig('cao_profile_id', e.target.value || null)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">Geen CAO</option>
                    {cao.map(c => <option key={c.id} value={c.id}>{c.naam}</option>)}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Notities</label>
                  <textarea
                    value={geselecteerd.notities ?? ''}
                    onChange={e => wijzig('notities', e.target.value || null)}
                    rows={3}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={slaOp} disabled={opslaan} className="bg-black text-white px-4 py-2 rounded text-sm disabled:opacity-50">
                  {opslaan ? 'Opslaan…' : 'Opslaan'}
                </button>
                <button onClick={() => setGeselecteerd(null)} className="border px-4 py-2 rounded text-sm">Annuleren</button>
              </div>
            </div>
          ) : (
            <div className="border rounded-xl p-6 text-gray-400 text-sm flex items-center justify-center h-full min-h-48">
              Selecteer een medewerker om te bewerken
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
