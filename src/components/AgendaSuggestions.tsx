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
        const getAccessToken = async (): Promise<string | null> => {
          const { data } = await supabase.auth.getSession()
          if (data?.session?.access_token) return data.session.access_token

          // If session isn't loaded/available yet, try refresh using refresh token
          const refreshed = await supabase.auth.refreshSession()
          if (refreshed.data?.session?.access_token) return refreshed.data.session.access_token

          // fallback: some setups store the Supabase session in localStorage (no cookie)
          if (typeof window !== 'undefined') {
            for (const k of Object.keys(localStorage)) {
              if (k.startsWith('sb-') && k.endsWith('-auth-token')) {
                try {
                  const raw = localStorage.getItem(k)
                  const parsed = raw ? JSON.parse(raw) : null
                  if (parsed?.access_token) return parsed.access_token
                } catch {
                  // ignore parse errors
                }
              }
            }
          }

          return null
        }

        const callApi = async (accessToken: string | null) => {
          const headers: Record<string, string> = {}
          if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`

          const r = await fetch('/api/google/calendar', {
            credentials: 'include',
            cache: 'no-store',
            headers,
          })

          const json = await r.json().catch(() => ({}))
          return { ok: r.ok, status: r.status, json }
        }

        let token = await getAccessToken()
        let res = await callApi(token)

        // If token expired on server, refresh session and retry once.
        if (!res.ok && res.status === 401 && res.json?.error === 'not_authenticated') {
          const refreshed = await supabase.auth.refreshSession()
          token = refreshed.data?.session?.access_token ?? (await getAccessToken())
          res = await callApi(token)
        }

        if (!res.ok) throw new Error(res.json?.error ?? 'Agenda fout')
        setEvents(res.json?.events ?? [])
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
