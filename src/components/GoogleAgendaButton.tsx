'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type GoogleStatus = {
  connected: boolean
  api_ok?: boolean
  reconnect_required?: boolean
  email?: string | null
  error?: string
}

export default function GoogleAgendaButton({
  userId,
  variant = 'default',
}: {
  userId: string
  variant?: 'default' | 'subtle'
}) {
  const [status, setStatus] = useState<GoogleStatus | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const getAccessToken = async (): Promise<string | null> => {
          const { data } = await supabase.auth.getSession()
          if (data?.session?.access_token) return data.session.access_token
          const refreshed = await supabase.auth.refreshSession()
          if (refreshed.data?.session?.access_token) return refreshed.data.session.access_token

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

        const token = await getAccessToken()
        const headers: Record<string, string> = {}
        if (token) headers['Authorization'] = `Bearer ${token}`

        const r = await fetch('/api/google/status', {
          credentials: 'include',
          cache: 'no-store',
          headers,
        })

        const json = (await r.json().catch(() => null)) as any
        if (!json) throw new Error('Status laden mislukt')
        setStatus(json)
      } catch (e) {
        console.warn('GoogleAgendaButton status load failed', e)
        setStatus({ connected: false })
      }
    }

    load()
  }, [userId])

  if (status === null) return null

  const isOk = Boolean(status.connected && status.api_ok)
  const needsReconnect = Boolean(status.connected && status.reconnect_required)
  const email = (status.email ?? '').trim()

  if (isOk) {
    const label = email ? `Google Agenda: ${email} ✅` : 'Google Agenda gekoppeld ✅'
    if (variant === 'subtle') {
      return (
        <div className="border border-orange-200 bg-orange-50 text-orange-800 px-2 py-1 rounded text-xs">
          {label}
        </div>
      )
    }

    return (
      <div className="border px-3 py-2 rounded text-sm text-orange-700 bg-orange-50 inline-block">
        {label}
      </div>
    )
  }

  if (needsReconnect) {
    return (
      <a
        href={`/api/google/auth?state=${userId}`}
        className={
          variant === 'subtle'
            ? 'border border-orange-200 bg-orange-50 text-orange-800 px-2 py-1 rounded inline-block text-xs'
            : 'border border-orange-200 bg-orange-50 text-orange-800 px-3 py-2 rounded inline-block'
        }
      >
        🔄 Google opnieuw koppelen
      </a>
    )
  }

  return (
    <a
      href={`/api/google/auth?state=${userId}`}
      className={
        variant === 'subtle'
          ? 'border px-2 py-1 rounded inline-block text-xs'
          : 'border px-3 py-2 rounded inline-block'
      }
    >
      📅 Koppel Google Agenda
    </a>
  )
}
