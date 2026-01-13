'use client'

import { useEffect, useState } from 'react'

interface Suggestion {
  title: string
  start: string
  end: string
  location?: string | null
}

export default function AgendaSuggestions({
  onUse,
}: {
  onUse: (e: Suggestion) => void
}) {
  const [events, setEvents] = useState<Suggestion[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/google/calendar', {
          credentials: 'include', // 🔑 ZEER BELANGRIJK
          cache: 'no-store',
        })

        const json = await res.json()
        console.log('AgendaSuggestions API result:', json)

        if (!res.ok) {
          setError(json.error || 'API error')
          setEvents([])
          return
        }

        setEvents(json.events || [])
      } catch (e: any) {
        console.error('AgendaSuggestions fetch error', e)
        setError('fetch_failed')
        setEvents([])
      }
    }

    load()
  }, [])

  /* 🔴 NU ALTIJD IETS RENDEREN */

  if (events === null) {
    return (
      <div className="border p-3 text-sm text-gray-500">
        📅 Agenda laden…
      </div>
    )
  }

  if (error) {
    return (
      <div className="border p-3 text-sm text-red-600">
        ❌ Agenda fout: {error}
      </div>
    )
  }

  if (!events.length) {
    return (
      <div className="border p-3 text-sm text-gray-500">
        ℹ️ Geen agenda-items gevonden
      </div>
    )
  }

  return (
    <div className="border rounded p-3 space-y-2 bg-gray-50">
      <h3 className="font-medium text-sm">
        📅 Agenda suggesties
      </h3>

      {events.map((e, i) => (
        <div
          key={i}
          className="flex justify-between items-center text-sm border-t pt-2"
        >
          <div>
            <div className="font-medium">{e.title}</div>
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
          </div>

          <button
            onClick={() => onUse(e)}
            className="text-blue-600 text-xs"
          >
            ➕ gebruiken
          </button>
        </div>
      ))}
    </div>
  )
}
