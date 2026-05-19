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
  eind_tijd: string
  opdrachtgever_naam: string | null
  planning_medewerkers: { medewerker_naam: string | null }[]
}

const UREN = Array.from({ length: 16 }, (_, i) => i + 6)
const DAGEN = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

function startVanWeek(datum: Date): Date {
  const d = new Date(datum)
  const dag = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dag)
  d.setHours(0, 0, 0, 0)
  return d
}

function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function tijdNaarMin(tijd: string): number {
  const [u, m] = tijd.split(':').map(Number)
  return u * 60 + m
}

export default function WeekView({ onNieuwe }: { onNieuwe: (datum: string, tijd: string) => void }) {
  const [weekStart, setWeekStart] = useState(() => startVanWeek(new Date()))
  const [googleEvents, setGoogleEvents] = useState<GoogleEvent[]>([])
  const [planningEvents, setPlanningEvents] = useState<PlanningEvent[]>([])
  const [loading, setLoading] = useState(false)

  const weekDagen = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return d
  })

  useEffect(() => {
    let actief = true
    const haal = async () => {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      const vanDatum = toDateStr(weekDagen[0])
      const totDatum = toDateStr(weekDagen[6])
      const timeMin = weekDagen[0].toISOString()
      const timeMax = new Date(weekDagen[6].getTime() + 86400000).toISOString()

      const [googleRes, { data: planning }] = await Promise.all([
        user
          ? fetch(`/api/google/events?userId=${user.id}&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`).then(r => r.json())
          : Promise.resolve({ events: [] }),
        supabase.from('planning')
          .select('*, planning_medewerkers(medewerker_naam)')
          .gte('datum', vanDatum)
          .lte('datum', totDatum),
      ])

      if (actief) {
        setGoogleEvents(googleRes.events ?? [])
        setPlanningEvents(planning ?? [])
        setLoading(false)
      }
    }
    haal()
    return () => { actief = false }
  }, [weekStart]) // eslint-disable-line react-hooks/exhaustive-deps

  const vandaagStr = toDateStr(new Date())

  const top = (dt: string) => {
    const min = tijdNaarMin(dt.slice(11, 16))
    return ((min - 6 * 60) / 60) * 64
  }

  const hoogte = (start: string, end: string) => {
    const s = tijdNaarMin(start.slice(11, 16))
    const e = tijdNaarMin(end.slice(11, 16))
    return Math.max(((e - s) / 60) * 64, 20)
  }

  const nuTop = () => {
    const nu = new Date()
    return ((nu.getHours() * 60 + nu.getMinutes() - 360) / 60) * 64
  }

  return (
    <div className="border rounded-xl overflow-hidden bg-white">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekStart(s => { const d = new Date(s); d.setDate(d.getDate() - 7); return d })}
            className="px-3 py-1.5 bg-black text-white rounded font-bold text-lg">‹</button>
          <button onClick={() => setWeekStart(startVanWeek(new Date()))}
            className="text-sm px-3 py-1.5 bg-white border-2 border-black rounded font-semibold">Vandaag</button>
          <button onClick={() => setWeekStart(s => { const d = new Date(s); d.setDate(d.getDate() + 7); return d })}
            className="px-3 py-1.5 bg-black text-white rounded font-bold text-lg">›</button>
        </div>
        <p className="font-semibold text-sm">
          {weekDagen[0].toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })} –{' '}
          {weekDagen[6].toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
        {loading && <span className="text-xs text-gray-400">laden…</span>}
      </div>

      <div className="overflow-auto" style={{ maxHeight: '70vh' }}>
        <div className="flex">
          <div className="w-14 shrink-0 border-r">
            <div className="h-10 border-b" />
            {UREN.map(u => (
              <div key={u} className="h-16 border-b flex items-start justify-end pr-2 pt-1">
                <span className="text-xs text-gray-400">{String(u).padStart(2, '0')}:00</span>
              </div>
            ))}
          </div>

          {weekDagen.map((dag, di) => {
            const dagStr = toDateStr(dag)
            const gEvents = googleEvents.filter(e => (e.start.dateTime ?? e.start.date ?? '').slice(0, 10) === dagStr)
            const pEvents = planningEvents.filter(e => e.datum === dagStr)
            const isVandaag = dagStr === vandaagStr

            return (
              <div key={di} className="flex-1 min-w-0 border-r last:border-r-0">
                <div className={`h-10 border-b flex flex-col items-center justify-center sticky top-0 z-10 ${isVandaag ? 'bg-orange-50' : 'bg-gray-50'}`}>
                  <span className="text-xs text-gray-500">{DAGEN[di]}</span>
                  <span className={`text-sm font-bold ${isVandaag ? 'text-orange-600' : ''}`}>{dag.getDate()}</span>
                </div>

                <div className="relative">
                  {UREN.map(u => (
                    <div key={u} className="h-16 border-b hover:bg-blue-50/40 cursor-pointer"
                      onClick={() => onNieuwe(dagStr, `${String(u).padStart(2, '0')}:00`)} />
                  ))}

                  {isVandaag && (
                    <div className="absolute left-0 right-0 z-20 pointer-events-none flex items-center" style={{ top: nuTop() }}>
                      <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 shrink-0" />
                      <div className="flex-1 h-0.5 bg-red-500" />
                    </div>
                  )}

                  {gEvents.map(e => {
                    if (!e.start.dateTime) return null
                    const t = top(e.start.dateTime)
                    const h = hoogte(e.start.dateTime, e.end.dateTime ?? e.start.dateTime)
                    if (t < 0 || t > UREN.length * 64) return null
                    return (
                      <div key={e.id} title={e.summary}
                        className="absolute left-0.5 right-0.5 bg-blue-500 text-white rounded px-1 py-0.5 overflow-hidden z-10 cursor-default"
                        style={{ top: t, height: h }}>
                        <p className="text-xs font-medium truncate leading-tight">{e.summary}</p>
                        {h > 32 && <p className="text-xs opacity-75 truncate">{e.start.dateTime.slice(11,16)}</p>}
                      </div>
                    )
                  })}

                  {pEvents.map(e => {
                    const t = top(`${e.datum}T${e.start_tijd}`)
                    const h = hoogte(`${e.datum}T${e.start_tijd}`, `${e.datum}T${e.eind_tijd}`)
                    if (t < 0 || t > UREN.length * 64) return null
                    return (
                      <div key={e.id} title={e.titel}
                        className="absolute left-0.5 right-0.5 bg-orange-500 text-white rounded px-1 py-0.5 overflow-hidden z-10 ml-3 cursor-default"
                        style={{ top: t, height: h }}>
                        <p className="text-xs font-medium truncate leading-tight">{e.titel}</p>
                        {h > 32 && <p className="text-xs opacity-75 truncate">{e.start_tijd.slice(0,5)}</p>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex gap-4 px-4 py-2 border-t text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-500 inline-block" /> Google Agenda</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-500 inline-block" /> Dienst</span>
        <span>Klik tijdvak = nieuwe dienst</span>
      </div>
    </div>
  )
}
