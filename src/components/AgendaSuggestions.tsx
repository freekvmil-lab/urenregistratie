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
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/google/calendar', {
      credentials: 'include', // 🔑 DIT WAS HET PROBLEEM
      cache: 'no-store',
    })
      .then(async (r) => {
        const json = await r.json()
        if (!r.ok) throw new Error(json.error ?? 'Agenda fout')
        return json
      })
      .then((data) => {
        setEvents(data.events ?? [])
        setError(null)
      })
      .catch((e) => {
        console.error('Agenda error:', e)
        setError(e.message)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="text-sm text-gray-500">
        📅 Agenda laden…
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-sm text-red-600">
        ❌ Agenda fout: {error}
      </div>
    )
  }

  if (!events.length) {
    return (
      <div className="text-sm text-gray-500">
        ℹ️ Geen agenda suggesties gevonden
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-sm">
        📅 Agenda suggesties
      </h3>

      {events.map((e, i) => (
        <button
          key={i}
          onClick={() => onUse(e)}
          className="w-full text-left border rounded p-2 hover:bg-gray-50"
        >
          <div className="font-medium text-sm">
            {e.title}
          </div>
          <div className="text-xs text-gray-500">
            {new Date(e.start).toLocaleTimeString('nl-NL', {
              hour: '2-digit',
              minute: '2-digit',
            })}{' '}
            –{' '}
            {new Date(e.end).toLocaleTimeString('nl-NL', {
              hour: '2-digit',
              minute: '2-digit',
            })}
            {e.location && ` · ${e.location}`}
          </div>
        </button>
      ))}
    </div>
  )
}
