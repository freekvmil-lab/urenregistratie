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
  const [events, setEvents] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/google/calendar', {
          cache: 'no-store',
        })

        const json = await res.json()

        if (json?.events?.length) {
          setEvents(json.events)
        }
      } catch (e) {
        console.error('Agenda fetch failed', e)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  if (loading) return null
  if (!events.length) return null

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
