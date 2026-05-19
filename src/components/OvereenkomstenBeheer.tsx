'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Overeenkomst {
  id: string
  zzp_naam: string | null
  zzp_email: string | null
  opdracht_omschrijving: string
  datum_van: string
  tarief: number | null
  tarief_type: string
  status: string
  getekend_op: string | null
  created_at: string
}

interface Profile { id: string; name: string | null; email: string | null; type_medewerker: string; hourly_rate: number | null }
interface Planning { id: string; titel: string; datum: string; locatie: string | null; opdrachtgever_naam: string | null }

const STATUS_KLEUR: Record<string, string> = {
  concept: 'bg-gray-100 text-gray-700',
  verstuurd: 'bg-orange-100 text-orange-700',
  getekend: 'bg-green-100 text-green-700',
  geweigerd: 'bg-red-100 text-red-700',
}

export default function OvereenkomstenBeheer() {
  const [overeenkomsten, setOvereenkomsten] = useState<Overeenkomst[]>([])
  const [zzpers, setZzpers] = useState<Profile[]>([])
  const [planningen, setPlanningen] = useState<Planning[]>([])
  const [loading, setLoading] = useState(true)
  const [nieuw, setNieuw] = useState(false)
  const [form, setForm] = useState({ zzp_id: '', planning_id: '', tarief: '', tarief_type: 'uur', notities: '' })
  const [opslaan, setOpslaan] = useState(false)
  const [gekopieerd, setGekopieerd] = useState<string | null>(null)

  const laad = async () => {
    setLoading(true)
    const [{ data: ov }, { data: pr }, { data: pl }] = await Promise.all([
      supabase.from('overeenkomsten').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, name, email, type_medewerker, hourly_rate').eq('type_medewerker', 'zzp').is('deleted_at', null),
      supabase.from('planning').select('id, titel, datum, locatie, opdrachtgever_naam').order('datum', { ascending: false }).limit(50),
    ])
    setOvereenkomsten(ov ?? [])
    setZzpers(pr ?? [])
    setPlanningen(pl ?? [])
    setLoading(false)
  }

  useEffect(() => { laad() }, [])

  const verstuur = async () => {
    if (!form.zzp_id || !form.planning_id) return
    setOpslaan(true)
    await fetch('/api/admin/overeenkomsten', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planning_id: form.planning_id,
        zzp_id: form.zzp_id,
        tarief: form.tarief ? parseFloat(form.tarief) : null,
        tarief_type: form.tarief_type,
        notities: form.notities || null,
      }),
    })
    await laad()
    setNieuw(false)
    setForm({ zzp_id: '', planning_id: '', tarief: '', tarief_type: 'uur', notities: '' })
    setOpslaan(false)
  }

  const kopieerLink = (id: string) => {
    const url = `${window.location.origin}/overeenkomst/${id}`
    navigator.clipboard.writeText(url)
    setGekopieerd(id)
    setTimeout(() => setGekopieerd(null), 2000)
  }

  if (loading) return <p className="p-6">Laden…</p>

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Overeenkomsten ZZP</h1>
        <button onClick={() => setNieuw(true)} className="bg-black text-white px-4 py-2 rounded text-sm">
          + Nieuwe overeenkomst
        </button>
      </div>

      {nieuw && (
        <div className="border rounded-xl p-5 bg-gray-50 space-y-4">
          <h2 className="font-semibold">Nieuwe overeenkomst versturen</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">ZZP'er</label>
              <select value={form.zzp_id} onChange={e => {
                const zzp = zzpers.find(z => z.id === e.target.value)
                setForm(p => ({ ...p, zzp_id: e.target.value, tarief: String(zzp?.hourly_rate ?? '') }))
              }} className="w-full rounded border px-3 py-2 text-sm">
                <option value="">Kies ZZP'er…</option>
                {zzpers.map(z => <option key={z.id} value={z.id}>{z.name ?? z.email}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Koppel aan dienst</label>
              <select value={form.planning_id} onChange={e => setForm(p => ({ ...p, planning_id: e.target.value }))}
                className="w-full rounded border px-3 py-2 text-sm">
                <option value="">Kies dienst…</option>
                {planningen.map(p => <option key={p.id} value={p.id}>{p.datum} — {p.titel}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tarief (€)</label>
              <input type="number" step="0.01" value={form.tarief}
                onChange={e => setForm(p => ({ ...p, tarief: e.target.value }))}
                className="w-full rounded border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Per</label>
              <select value={form.tarief_type} onChange={e => setForm(p => ({ ...p, tarief_type: e.target.value }))}
                className="w-full rounded border px-3 py-2 text-sm">
                <option value="uur">Uur</option>
                <option value="dag">Dag</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Notities</label>
              <textarea value={form.notities} onChange={e => setForm(p => ({ ...p, notities: e.target.value }))}
                rows={2} className="w-full rounded border px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={verstuur} disabled={opslaan} className="bg-black text-white px-4 py-2 rounded text-sm disabled:opacity-50">
              {opslaan ? 'Versturen…' : '📤 Verstuur naar ZZP'er'}
            </button>
            <button onClick={() => setNieuw(false)} className="border px-4 py-2 rounded text-sm">Annuleren</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {overeenkomsten.map(o => (
          <div key={o.id} className="border rounded-xl p-4 bg-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-semibold">{o.zzp_naam ?? o.zzp_email}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_KLEUR[o.status]}`}>
                    {o.status}
                  </span>
                </div>
                <p className="text-sm text-gray-600">{o.opdracht_omschrijving}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {o.datum_van} · {o.tarief ? `€${o.tarief}/${o.tarief_type}` : 'geen tarief'}
                  {o.getekend_op && ` · ✅ Getekend ${new Date(o.getekend_op).toLocaleDateString('nl-NL')}`}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => kopieerLink(o.id)}
                  className="text-sm border px-3 py-1.5 rounded hover:bg-gray-50">
                  {gekopieerd === o.id ? '✅ Gekopieerd!' : '🔗 Kopieer link'}
                </button>
                <a href={`/overeenkomst/${o.id}`} target="_blank"
                  className="text-sm border px-3 py-1.5 rounded hover:bg-gray-50">
                  Bekijk
                </a>
              </div>
            </div>
          </div>
        ))}
        {overeenkomsten.length === 0 && (
          <p className="text-gray-400 text-center py-8">Nog geen overeenkomsten verstuurd.</p>
        )}
      </div>
    </div>
  )
}
