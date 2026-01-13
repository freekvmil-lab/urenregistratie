'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface AgendaEvent {
  title: string
  start: string
  end: string
  location?: string | null
  isAllDay?: boolean
}

export default function AgendaSuggestions({
  onUse,
}: {
  onUse?: (e: AgendaEvent) => void
}) {
  const [events, setEvents] = useState<AgendaEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await supabase.auth.getSession()
        let accessToken = data?.session?.access_token

        // fallback: some setups store the Supabase session in localStorage (no cookie)
        if (!accessToken && typeof window !== 'undefined') {
          for (const k of Object.keys(localStorage)) {
            if (k.startsWith('sb-') && k.endsWith('-auth-token')) {
              try {
                const raw = localStorage.getItem(k)
                const parsed = raw ? JSON.parse(raw) : null
                if (parsed?.access_token) {
                  accessToken = parsed.access_token
                  break
                }
              } catch (e) {
                // ignore parse errors
              }
            }
          }
        }

        const headers: Record<string, string> = {}
        if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`

        const r = await fetch('/api/google/calendar', {
          credentials: 'include',
          cache: 'no-store',
          headers,
        })

        const json = await r.json()
        if (!r.ok) throw new Error(json.error ?? 'Agenda fout')
        setEvents(json.events ?? [])
        setError(null)
      } catch (e: any) {
        console.error('Agenda error:', e)
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  if (loading) {
    return (
      <div className="text-sm text-gray-400">
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
      <div className="text-sm text-gray-400">
        ℹ️ Geen agenda suggesties gevonden
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-sm text-gray-100">
        📅 Agenda suggesties
      </h3>

      {events.map((e: any, i) => {
        const dateLabel = new Date(e.start).toLocaleDateString('nl-NL', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })

        return (
          <button
            key={i}
            onClick={() => onUse?.(e)}
            className="w-full text-left border border-gray-700 rounded p-2 bg-black/20 hover:bg-black/30"
            type="button"
          >
            <div className="font-medium text-sm flex items-center justify-between">
              <div className="truncate text-gray-100">{e.title}</div>
              <div className="text-xs text-gray-400 ml-2">{dateLabel}</div>
            </div>
            <div className="text-xs text-gray-400">
              {e.isAllDay ? (
                <span>Hele dag</span>
              ) : (
                <>
                  {new Date(e.start).toLocaleTimeString('nl-NL', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  –{' '}
                  {new Date(e.end).toLocaleTimeString('nl-NL', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </>
              )}
              {e.location && ` · ${e.location}`}
            </div>
          </button>
        )
      })}
    </div>
  )
}
