'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

interface GoogleEvent {
  id: string
  summary: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
}

interface PlanningEvent {
  id: string
  titel: string
  datum: string
  start_tijd: string
  eind_tijd: string
  opdrachtgever_naam: string | null
  planning_medewerkers: { medewerker_naam: string | null }[]
}

const DAGEN_KORT = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']
const MAANDEN = ['Januari','Februari','Maart','April','Mei','Juni','Juli','Augustus','September','Oktober','November','December']

function formatDatum(d: Date) {
  return d.toISOString().split('T')[0]
}

export default function MonthView({ onNieuwe }: { onNieuwe: (datum: string, tijd: string) => void }) {
  const [huidigeDatum, setHuidigeDatum] = useState(new Date())
  const [googleEvents, setGoogleEvents] = useState<GoogleEvent[]>([])
  const [planningEvents, setPlanningEvents] = useState<PlanningEvent[]>([])
  const [loading, setLoading] = useState(false)

  const jaar = huidigeDatum.getFullYear()
  const maand = huidigeDatum.getMonth()

  const eersteVanMaand = new Date(jaar, maand, 1)
  const startDag = (eersteVanMaand.getDay() + 6) % 7 // Ma=0
  const aantalDagen = new Date(jaar, maand + 1, 0).getDate()

  // Kalender grid: 6 weken x 7 dagen
  const cellen: (Date | null)[] = []
  for (let i = 0; i < startDag; i++) cellen.push(null)
  for (let i = 1; i <= aantalDagen; i++) cellen.push(new Date(jaar, maand, i))
  while (cellen.length % 7 !== 0) cellen.push(null)

  const laad = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()

    const timeMin = new Date(jaar, maand, 1).toISOString()
    const timeMax = new Date(jaar, maand + 1, 1).toISOString()
    const vanDatum = formatDatum(new Date(jaar, maand, 1))
    const totDatum = formatDatum(new Date(jaar, maand + 1, 0))

    const [googleRes, { data: planning }] = await Promise.all([
      user ? fetch(`/api/google/events?userId=${user.id}&timeMin=${timeMin}&timeMax=${timeMax}`).then(r => r.json()) : Promise.resolve({ events: [] }),
      supabase.from('planning').select('*, planning_medewerkers(medewerker_naam)').gte('datum', vanDatum).lte('datum', totDatum),
    ])

    setGoogleEvents(googleRes.events ?? [])
    setPlanningEvents(planning ?? [])
    setLoading(false)
  }, [jaar, maand])

  useEffect(() => { laad() }, [laad])

  const vorigeMaand = () => setHuidigeDatum(new Date(jaar, maand - 1, 1))
  const volgendeMaand = () => setHuidigeDatum(new Date(jaar, maand + 1, 1))
  const vandaag = () => setHuidigeDatum(new Date())

  const dagEvents = (datum: Date) => {
    const dagStr = formatDatum(datum)
    const google = googleEvents.filter(e => (e.start.dateTime ?? e.start.date ?? '').startsWith(dagStr))
    const planning = planningEvents.filter(e => e.datum === dagStr)
    return { google, planning }
  }

  const isVandaag = (d: Date) => formatDatum(d) === formatDatum(new Date())

  return (
    <div className="border rounded-xl overflow-hidden bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
        <div className="flex items-center gap-2">
          <button onClick={vorigeMaand} className="px-3 py-1.5 bg-black text-white rounded font-bold text-lg hover:bg-gray-800">‹</button>
          <button onClick={vandaag} className="text-sm px-3 py-1.5 bg-white border-2 border-black rounded font-semibold hover:bg-gray-100">Vandaag</button>
          <button onClick={volgendeMaand} className="px-3 py-1.5 bg-black text-white rounded font-bold text-lg hover:bg-gray-800">›</button>
        </div>
        <p className="font-semibold text-lg">{MAANDEN[maand]} {jaar}</p>
        {loading && <span className="text-xs text-gray-400">Laden…</span>}
      </div>

      {/* Dag headers */}
      <div className="grid grid-cols-7 border-b">
        {DAGEN_KORT.map(d => (
          <div key={d} className="py-2 text-center text-xs font-medium text-gray-500 border-r last:border-r-0">
            {d}
          </div>
        ))}
      </div>

      {/* Kalender grid */}
      <div className="grid grid-cols-7">
        {cellen.map((dag, i) => {
          if (!dag) return (
            <div key={i} className="min-h-24 border-r border-b last:border-r-0 bg-gray-50/50" />
          )

          const { google, planning } = dagEvents(dag)
          const totaalEvents = google.length + planning.length
          const vandaagIndicator = isVandaag(dag)

          return (
            <div
              key={i}
              className={`min-h-24 border-r border-b last:border-r-0 p-1 cursor-pointer hover:bg-blue-50/30 transition-colors ${vandaagIndicator ? 'bg-orange-50' : ''}`}
              onClick={() => onNieuwe(formatDatum(dag), '08:00')}
            >
              <div className="flex justify-between items-start mb-1">
                <span className={`text-sm font-medium w-6 h-6 flex items-center justify-center rounded-full ${vandaagIndicator ? 'bg-orange-500 text-white' : 'text-gray-700'}`}>
                  {dag.getDate()}
                </span>
                {totaalEvents > 2 && (
                  <span className="text-xs text-gray-400">+{totaalEvents - 2}</span>
                )}
              </div>

              <div className="space-y-0.5">
                {planning.slice(0, 2).map(e => (
                  <div key={e.id} className="bg-orange-500 text-white text-xs rounded px-1 truncate">
                    {e.start_tijd.slice(0,5)} {e.titel}
                  </div>
                ))}
                {google.slice(0, Math.max(0, 2 - planning.length)).map(e => (
                  <div key={e.id} className="bg-blue-500 text-white text-xs rounded px-1 truncate">
                    {e.start.dateTime ? e.start.dateTime.slice(11,16) + ' ' : ''}{e.summary}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Legenda */}
      <div className="flex gap-4 px-4 py-2 border-t text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-500 inline-block" /> Google Agenda</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-500 inline-block" /> Geplande dienst</span>
        <span className="text-gray-400">Klik op een dag om een dienst aan te maken</span>
      </div>
    </div>
  )
}
