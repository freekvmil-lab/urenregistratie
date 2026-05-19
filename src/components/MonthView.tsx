'use client'

import { useEffect, useState } from 'react'
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
  opdrachtgever_naam: string | null
}

const DAGEN = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']
const MAANDEN = ['Januari','Februari','Maart','April','Mei','Juni','Juli','Augustus','September','Oktober','November','December']

function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

export default function MonthView({ onNieuwe }: { onNieuwe: (datum: string, tijd: string) => void }) {
  const [jaar, setJaar] = useState(new Date().getFullYear())
  const [maand, setMaand] = useState(new Date().getMonth())
  const [googleEvents, setGoogleEvents] = useState<GoogleEvent[]>([])
  const [planningEvents, setPlanningEvents] = useState<PlanningEvent[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let actief = true
    const haal = async () => {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      const vanDatum = toDateStr(new Date(jaar, maand, 1))
      const totDatum = toDateStr(new Date(jaar, maand + 1, 0))
      const timeMin = new Date(jaar, maand, 1).toISOString()
      const timeMax = new Date(jaar, maand + 1, 1).toISOString()

      const [googleRes, { data: planning }] = await Promise.all([
        user
          ? fetch(`/api/google/events?userId=${user.id}&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`).then(r => r.json())
          : Promise.resolve({ events: [] }),
        supabase.from('planning').select('id, titel, datum, start_tijd, opdrachtgever_naam')
          .gte('datum', vanDatum).lte('datum', totDatum),
      ])

      if (actief) {
        setGoogleEvents(googleRes.events ?? [])
        setPlanningEvents(planning ?? [])
        setLoading(false)
      }
    }
    haal()
    return () => { actief = false }
  }, [jaar, maand])

  const vorigeMaand = () => { if (maand === 0) { setMaand(11); setJaar(j => j - 1) } else setMaand(m => m - 1) }
  const volgendeMaand = () => { if (maand === 11) { setMaand(0); setJaar(j => j + 1) } else setMaand(m => m + 1) }
  const naarVandaag = () => { setJaar(new Date().getFullYear()); setMaand(new Date().getMonth()) }

  const eersteVanMaand = new Date(jaar, maand, 1)
  const startDag = (eersteVanMaand.getDay() + 6) % 7
  const aantalDagen = new Date(jaar, maand + 1, 0).getDate()
  const vandaagStr = toDateStr(new Date())

  const cellen: (number | null)[] = [
    ...Array(startDag).fill(null),
    ...Array.from({ length: aantalDagen }, (_, i) => i + 1),
  ]
  while (cellen.length % 7 !== 0) cellen.push(null)

  const dagStr = (dag: number) => {
    const m = String(maand + 1).padStart(2, '0')
    const d = String(dag).padStart(2, '0')
    return `${jaar}-${m}-${d}`
  }

  return (
    <div className="border rounded-xl overflow-hidden bg-white">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
        <div className="flex items-center gap-2">
          <button onClick={vorigeMaand} className="px-3 py-1.5 bg-black text-white rounded font-bold text-lg">‹</button>
          <button onClick={naarVandaag} className="text-sm px-3 py-1.5 bg-white border-2 border-black rounded font-semibold">Vandaag</button>
          <button onClick={volgendeMaand} className="px-3 py-1.5 bg-black text-white rounded font-bold text-lg">›</button>
        </div>
        <p className="font-semibold text-lg">{MAANDEN[maand]} {jaar}</p>
        {loading && <span className="text-xs text-gray-400">laden…</span>}
      </div>

      <div className="grid grid-cols-7 border-b">
        {DAGEN.map(d => (
          <div key={d} className="py-2 text-center text-xs font-medium text-gray-500 border-r last:border-r-0">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cellen.map((dag, i) => {
          if (!dag) return <div key={i} className="min-h-24 border-r border-b bg-gray-50/40" />

          const ds = dagStr(dag)
          const gEv = googleEvents.filter(e => (e.start.dateTime ?? e.start.date ?? '').slice(0, 10) === ds)
          const pEv = planningEvents.filter(e => e.datum === ds)
          const isVandaag = ds === vandaagStr
          const totaal = gEv.length + pEv.length

          return (
            <div key={i}
              className={`min-h-24 border-r border-b p-1 cursor-pointer hover:bg-blue-50/30 ${isVandaag ? 'bg-orange-50' : ''}`}
              onClick={() => onNieuwe(ds, '08:00')}>
              <div className="flex justify-between items-center mb-1">
                <span className={`text-sm font-semibold w-6 h-6 flex items-center justify-center rounded-full ${isVandaag ? 'bg-orange-500 text-white' : 'text-gray-700'}`}>
                  {dag}
                </span>
                {totaal > 2 && <span className="text-xs text-gray-400">+{totaal - 2}</span>}
              </div>
              <div className="space-y-0.5">
                {pEv.slice(0, 2).map(e => (
                  <div key={e.id} className="bg-orange-500 text-white text-xs rounded px-1 truncate leading-5">
                    {e.start_tijd.slice(0,5)} {e.titel}
                  </div>
                ))}
                {gEv.slice(0, Math.max(0, 2 - pEv.length)).map(e => (
                  <div key={e.id} className="bg-blue-500 text-white text-xs rounded px-1 truncate leading-5">
                    {e.start.dateTime ? e.start.dateTime.slice(11, 16) + ' ' : ''}{e.summary}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex gap-4 px-4 py-2 border-t text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-500 inline-block" /> Google Agenda</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-500 inline-block" /> Dienst</span>
        <span>Klik dag = nieuwe dienst</span>
      </div>
    </div>
  )
}
