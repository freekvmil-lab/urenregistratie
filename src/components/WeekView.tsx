'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

interface GoogleEvent {
  id: string
  summary: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  location?: string
  description?: string
}

interface PlanningEvent {
  id: string
  titel: string
  datum: string
  start_tijd: string
  eind_tijd: string
  locatie: string | null
  opdrachtgever_naam: string | null
  planning_medewerkers: { medewerker_naam: string | null }[]
}

const UREN = Array.from({ length: 16 }, (_, i) => i + 6) // 06:00 - 21:00
const DAGEN = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

function startVanWeek(datum: Date) {
  const d = new Date(datum)
  const dag = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dag)
  d.setHours(0, 0, 0, 0)
  return d
}

function formatDatum(d: Date) {
  return d.toISOString().split('T')[0]
}

function tijdNaarMinuten(tijd: string) {
  const [u, m] = tijd.split(':').map(Number)
  return u * 60 + m
}

function eventTop(start: string) {
  const min = tijdNaarMinuten(start.slice(11, 16))
  return ((min - 6 * 60) / 60) * 64
}

function eventHoogte(start: string, end: string) {
  const s = tijdNaarMinuten(start.slice(11, 16))
  const e = tijdNaarMinuten(end.slice(11, 16))
  return Math.max(((e - s) / 60) * 64, 24)
}

export default function WeekView({ onNieuwe }: { onNieuwe: (datum: string, tijd: string) => void }) {
  const [weekStart, setWeekStart] = useState(() => startVanWeek(new Date()))
  const [googleEvents, setGoogleEvents] = useState<GoogleEvent[]>([])
  const [planningEvents, setPlanningEvents] = useState<PlanningEvent[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const weekDagen = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return d
  })

  const laad = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) setUserId(user.id)

    const timeMin = weekDagen[0].toISOString()
    const timeMax = new Date(weekDagen[6].getTime() + 86400000).toISOString()
    const vanDatum = formatDatum(weekDagen[0])
    const totDatum = formatDatum(weekDagen[6])

    const [googleRes, { data: planning }] = await Promise.all([
      user ? fetch(`/api/google/events?userId=${user.id}&timeMin=${timeMin}&timeMax=${timeMax}`).then(r => r.json()) : Promise.resolve({ events: [] }),
      supabase.from('planning').select('*, planning_medewerkers(medewerker_naam)').gte('datum', vanDatum).lte('datum', totDatum),
    ])

    setGoogleEvents(googleRes.events ?? [])
    setPlanningEvents(planning ?? [])
    setLoading(false)
  }, [weekStart])

  useEffect(() => { laad() }, [laad])

  const vorigeWeek = () => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() - 7)
    setWeekStart(d)
  }

  const volgendeWeek = () => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + 7)
    setWeekStart(d)
  }

  const vandaag = () => setWeekStart(startVanWeek(new Date()))

  const nuLijn = () => {
    const nu = new Date()
    const min = nu.getHours() * 60 + nu.getMinutes()
    return ((min - 6 * 60) / 60) * 64
  }

  const isVandaag = (d: Date) => formatDatum(d) === formatDatum(new Date())

  return (
    <div className="border rounded-xl overflow-hidden bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
        <div className="flex items-center gap-2">
          <button onClick={vorigeWeek} className="px-3 py-1.5 bg-black text-white rounded font-bold text-lg hover:bg-gray-800">‹</button>
          <button onClick={vandaag} className="text-sm px-3 py-1.5 bg-white border-2 border-black rounded font-semibold hover:bg-gray-100">Vandaag</button>
          <button onClick={volgendeWeek} className="px-3 py-1.5 bg-black text-white rounded font-bold text-lg hover:bg-gray-800">›</button>
        </div>
        <p className="font-semibold text-sm">
          {weekDagen[0].toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })} – {weekDagen[6].toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
        {loading && <span className="text-xs text-gray-400">Laden…</span>}
      </div>

      <div className="overflow-auto max-h-[75vh]">
        <div className="flex">
          {/* Tijdkolom */}
          <div className="w-14 shrink-0 border-r">
            <div className="h-10 border-b" />
            {UREN.map(u => (
              <div key={u} className="h-16 border-b flex items-start justify-end pr-2 pt-1">
                <span className="text-xs text-gray-400">{String(u).padStart(2,'0')}:00</span>
              </div>
            ))}
          </div>

          {/* Dagkolommen */}
          {weekDagen.map((dag, di) => {
            const dagStr = formatDatum(dag)
            const dagGoogle = googleEvents.filter(e => {
              const start = e.start.dateTime ?? e.start.date ?? ''
              return start.startsWith(dagStr)
            })
            const dagPlanning = planningEvents.filter(e => e.datum === dagStr)

            return (
              <div key={di} className="flex-1 min-w-0 border-r last:border-r-0 relative">
                {/* Dag header */}
                <div className={`h-10 border-b flex flex-col items-center justify-center sticky top-0 z-10 ${isVandaag(dag) ? 'bg-orange-50' : 'bg-gray-50'}`}>
                  <span className="text-xs text-gray-500">{DAGEN[di]}</span>
                  <span className={`text-sm font-bold ${isVandaag(dag) ? 'text-orange-600' : ''}`}>{dag.getDate()}</span>
                </div>

                {/* Uur vakken */}
                <div className="relative">
                  {UREN.map(u => (
                    <div
                      key={u}
                      className="h-16 border-b hover:bg-blue-50/30 cursor-pointer transition-colors"
                      onClick={() => onNieuwe(dagStr, `${String(u).padStart(2,'0')}:00`)}
                    />
                  ))}

                  {/* Vandaag lijn */}
                  {isVandaag(dag) && (
                    <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: nuLijn() }}>
                      <div className="flex items-center">
                        <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
                        <div className="flex-1 h-0.5 bg-red-500" />
                      </div>
                    </div>
                  )}

                  {/* Google Calendar events */}
                  {dagGoogle.map(e => {
                    if (!e.start.dateTime) return null
                    const top = eventTop(e.start.dateTime)
                    const hoogte = eventHoogte(e.start.dateTime, e.end.dateTime ?? e.start.dateTime)
                    if (top < 0) return null
                    return (
                      <div
                        key={e.id}
                        className="absolute left-0.5 right-0.5 bg-blue-500 text-white rounded px-1 py-0.5 overflow-hidden z-10"
                        style={{ top, height: hoogte }}
                        title={e.summary}
                      >
                        <p className="text-xs font-medium truncate">{e.summary}</p>
                        {hoogte > 30 && e.location && <p className="text-xs opacity-80 truncate">{e.location}</p>}
                      </div>
                    )
                  })}

                  {/* Planning events */}
                  {dagPlanning.map(e => {
                    const top = eventTop(`${e.datum}T${e.start_tijd}`)
                    const hoogte = eventHoogte(`${e.datum}T${e.start_tijd}`, `${e.datum}T${e.eind_tijd}`)
                    if (top < 0) return null
                    const namen = e.planning_medewerkers.map(m => m.medewerker_naam).filter(Boolean).join(', ')
                    return (
                      <div
                        key={e.id}
                        className="absolute left-0.5 right-0.5 bg-orange-500 text-white rounded px-1 py-0.5 overflow-hidden z-10 ml-4"
                        style={{ top, height: hoogte }}
                        title={e.titel}
                      >
                        <p className="text-xs font-medium truncate">{e.titel}</p>
                        {hoogte > 30 && namen && <p className="text-xs opacity-80 truncate">{namen}</p>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Legenda */}
      <div className="flex gap-4 px-4 py-2 border-t text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-500 inline-block" /> Google Agenda</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-500 inline-block" /> Geplande dienst</span>
        <span className="text-gray-400">Klik op een tijdvak om een dienst aan te maken</span>
      </div>
    </div>
  )
}
