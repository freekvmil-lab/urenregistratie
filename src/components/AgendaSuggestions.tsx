'use client'

import { useEffect, useState } from 'react'

interface AgendaEvent {
  title: string
  start: string
  end: string
  location?: string | null
}

export default function AgendaSuggestions({
  onUse,
}: {
  onUse: (e: AgendaEvent) => void
}) {
  const [events, setEvents] = useState<AgendaEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/google/calendar', {
          cache: 'no-store',
        })
        const json = await res.json()

        if (json.events) {
          // ⛔ filter all-day events eruit
          const usable = json.events.filter(
            (e: any) =>
              e.start?.includes('T') &&
              e.end?.includes('T')
          )

          setEvents(usable)
        }
      } catch (e) {
        console.error('Agenda load failed', e)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  if (loading || events.length === 0) return null

  return (
    <div className="border rounded p-4 space-y-3 bg-gray-50">
      <h3 className="font-semibold">
        🧠 Agenda suggesties
      </h3>

      {events.map((e, i) => {
        const start = new Date(e.start)
        const end = new Date(e.end)

        return (
          <div
            key={i}
            className="flex justify-between items-center border-t pt-2 text-sm"
          >
            <div>
              <div className="font-medium">
                {e.title}
              </div>
              <div className="text-gray-600">
                {start.toLocaleDateString('nl-NL', {
                  weekday: 'short',
                  day: '2-digit',
                  month: 'short',
                })}{' '}
                {start.toLocaleTimeString('nl-NL', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {' – '}
                {end.toLocaleTimeString('nl-NL', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
              {e.location && (
                <div className="text-xs text-gray-500">
                  📍 {e.location}
                </div>
              )}
            </div>

            <button
              onClick={() => onUse(e)}
              className="border px-2 py-1 rounded text-xs"
            >
              ➕ Gebruik
            </button>
          </div>
        )
      })}
    </div>
  )
}
