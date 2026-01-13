'use client'
console.log('AgendaSuggestions mounted')
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
  <div className="border p-4">
    <strong>AgendaSuggestions zichtbaar</strong>
  </div>
)

      })}
    </div>
  )
}
