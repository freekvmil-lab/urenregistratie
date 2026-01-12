'use client'

import { useEffect, useState } from 'react'

interface Event {
  id: string
  title: string
  location?: string
  start: string
  end: string
}

export default function AgendaSuggestions({
  onUse,
}: {
  onUse: (e: Event) => void
}) {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/google/calendar')
        if (!res.ok) {
          throw new Error('Geen toegang tot agenda')
        }
        const data = await res.json()
        setEvents(data)
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  if (loading) return <p>📅 Agenda laden…</p>
  if (error) return null
  if (events.length === 0)
    return <p className="text-sm text-gray-500">Geen agenda-suggesties vandaag</p>

  return (
    <div className="space-y-2">
      <h3 className="font-semibold">📅 Agenda-suggesties</h3>

      {events.map((e) => (
        <div
          key={e.id}
          className="border rounded p-2 text-sm flex justify-between items-center"
        >
          <div>
            <div className="font-medium">{e.title}</div>
            <div className="text-xs text-gray-500">
              {new Date(e.start).toLocaleTimeString('nl-NL', {
                hour: '2-digit',
                minute: '2-digit',
              })}
              {' – '}
              {new Date(e.end).toLocaleTimeString('nl-NL', {
                hour: '2-digit',
                minute: '2-digit',
              })}
              {e.location && ` · 📍 ${e.location}`}
            </div>
          </div>

          <button
            onClick={() => onUse(e)}
            className="text-blue-600 text-sm"
          >
            Gebruik
          </button>
        </div>
      ))}
    </div>
  )
}
