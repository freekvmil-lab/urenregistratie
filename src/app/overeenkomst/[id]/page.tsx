'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useParams } from 'next/navigation'

interface Overeenkomst {
  id: string
  zzp_naam: string | null
  zzp_email: string | null
  zzp_adres: string | null
  zzp_iban: string | null
  opdracht_omschrijving: string
  locatie: string | null
  datum_van: string
  datum_tot: string | null
  tarief: number | null
  tarief_type: string
  status: string
  getekend_op: string | null
  notities: string | null
}

export default function TekenPagina() {
  const params = useParams()
  const id = params?.id as string
  const [overeenkomst, setOvereenkomst] = useState<Overeenkomst | null>(null)
  const [loading, setLoading] = useState(true)
  const [bezig, setBezig] = useState(false)
  const [klaar, setKlaar] = useState<'getekend' | 'geweigerd' | null>(null)
  const [naam, setNaam] = useState('')

  useEffect(() => {
    supabase.from('overeenkomsten').select('*').eq('id', id).single()
      .then(({ data }) => { setOvereenkomst(data); setLoading(false) })
  }, [id])

  const handel = async (actie: 'teken' | 'weiger') => {
    if (actie === 'teken' && !naam.trim()) {
      alert('Vul je naam in ter bevestiging')
      return
    }
    setBezig(true)
    await fetch('/api/admin/overeenkomsten', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ overeenkomst_id: id, actie }),
    })
    setKlaar(actie)
    setBezig(false)
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen"><p>Laden…</p></div>
  if (!overeenkomst) return <div className="flex items-center justify-center min-h-screen"><p>Overeenkomst niet gevonden.</p></div>

  if (klaar === 'getekend') return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center space-y-3">
        <p className="text-4xl">✅</p>
        <h1 className="text-xl font-bold">Overeenkomst getekend!</h1>
        <p className="text-gray-600">Bedankt. Je ontvangt een bevestiging per e-mail.</p>
      </div>
    </div>
  )

  if (klaar === 'geweigerd') return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center space-y-3">
        <p className="text-4xl">❌</p>
        <h1 className="text-xl font-bold">Overeenkomst geweigerd</h1>
        <p className="text-gray-600">Neem contact op met Vortexx voor vragen.</p>
      </div>
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">Overeenkomst van Opdracht</h1>
          <p className="text-sm text-gray-500">Vortexx Group B.V.</p>
        </div>
        <div className={`px-3 py-1 rounded-full text-sm font-medium ${
          overeenkomst.status === 'getekend' ? 'bg-green-100 text-green-800' :
          overeenkomst.status === 'geweigerd' ? 'bg-red-100 text-red-800' :
          'bg-orange-100 text-orange-800'
        }`}>
          {overeenkomst.status === 'verstuurd' ? '📋 Wacht op ondertekening' :
           overeenkomst.status === 'getekend' ? '✅ Getekend' : overeenkomst.status}
        </div>
      </div>

      {/* Partijen */}
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-gray-500 uppercase">Opdrachtgever</p>
          <p className="font-semibold">Vortexx Group B.V.</p>
          <p className="text-sm text-gray-600">van Limburg Stirumlaan 41</p>
          <p className="text-sm text-gray-600">1411BM Naarden</p>
          <p className="text-sm text-gray-600">KVK: 94941602</p>
          <p className="text-sm text-gray-600">BTW: NL866944229B01</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-semibold text-gray-500 uppercase">Opdrachtnemer</p>
          <p className="font-semibold">{overeenkomst.zzp_naam ?? '—'}</p>
          <p className="text-sm text-gray-600">{overeenkomst.zzp_adres ?? '—'}</p>
          <p className="text-sm text-gray-600">{overeenkomst.zzp_email ?? '—'}</p>
          {overeenkomst.zzp_iban && <p className="text-sm text-gray-600">IBAN: {overeenkomst.zzp_iban}</p>}
        </div>
      </div>

      {/* Opdracht details */}
      <div className="border rounded-xl p-4 space-y-3 bg-gray-50">
        <h2 className="font-semibold">Opdracht</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-gray-500">Omschrijving</p><p className="font-medium">{overeenkomst.opdracht_omschrijving}</p></div>
          <div><p className="text-gray-500">Locatie</p><p className="font-medium">{overeenkomst.locatie ?? '—'}</p></div>
          <div><p className="text-gray-500">Datum</p><p className="font-medium">{overeenkomst.datum_van}{overeenkomst.datum_tot && overeenkomst.datum_tot !== overeenkomst.datum_van ? ` t/m ${overeenkomst.datum_tot}` : ''}</p></div>
          <div><p className="text-gray-500">Tarief</p><p className="font-medium">{overeenkomst.tarief ? `€ ${overeenkomst.tarief} per ${overeenkomst.tarief_type}` : '—'}</p></div>
        </div>
        {overeenkomst.notities && <div><p className="text-gray-500 text-sm">Notities</p><p className="text-sm">{overeenkomst.notities}</p></div>}
      </div>

      {/* Voorwaarden */}
      <div className="text-sm text-gray-600 space-y-2 border rounded-xl p-4">
        <p className="font-semibold text-gray-800">Voorwaarden</p>
        <p>Opdrachtnemer verricht de werkzaamheden als zelfstandige ondernemer, zonder gezagsverhouding.</p>
        <p>Opdrachtnemer is zelf verantwoordelijk voor afdracht van belastingen en sociale premies.</p>
        <p>Opdrachtnemer beschikt over een geldige VAR of werkt conform de DBA-wetgeving.</p>
        <p>Betaling vindt plaats binnen 30 dagen na ontvangst van de factuur van opdrachtnemer.</p>
      </div>

      {/* Tekenen */}
      {overeenkomst.status === 'verstuurd' && (
        <div className="border-2 border-orange-300 rounded-xl p-4 space-y-3 bg-orange-50">
          <p className="font-semibold">Ondertekenen</p>
          <p className="text-sm text-gray-600">Typ je volledige naam ter bevestiging en klik op Akkoord.</p>
          <input
            type="text"
            value={naam}
            onChange={e => setNaam(e.target.value)}
            placeholder={overeenkomst.zzp_naam ?? 'Volledige naam'}
            className="w-full rounded border px-3 py-2 text-sm"
          />
          <div className="flex gap-3">
            <button onClick={() => handel('teken')} disabled={bezig}
              className="flex-1 bg-black text-white py-2 rounded font-semibold disabled:opacity-50">
              {bezig ? 'Bezig…' : '✍️ Akkoord — Ondertekenen'}
            </button>
            <button onClick={() => handel('weiger')} disabled={bezig}
              className="border border-red-300 text-red-600 px-4 py-2 rounded text-sm disabled:opacity-50">
              Weigeren
            </button>
          </div>
        </div>
      )}

      {overeenkomst.status === 'getekend' && (
        <div className="bg-green-50 border border-green-300 rounded-xl p-4 text-center">
          <p className="text-green-800 font-semibold">✅ Getekend op {new Date(overeenkomst.getekend_op!).toLocaleDateString('nl-NL')}</p>
        </div>
      )}
    </div>
  )
}
