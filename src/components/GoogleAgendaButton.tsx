'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function GoogleAgendaButton() {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)

  const loadStatus = async () => {
    try {
      const r = await fetch('/api/google/status', {
        cache: 'no-store',
      })
      const d = await r.json()
      setConnected(d.connected)
    } catch {
      setConnected(false)
    }
  }

  useEffect(() => {
    // ✅ 1️⃣ check status normaal
    loadStatus()

    // ✅ 2️⃣ check of we net terugkomen van OAuth
    const params = new URLSearchParams(window.location.search)
    if (params.get('google') === 'connected') {
      // force refresh status
      loadStatus()

      // optioneel: URL opschonen
      window.history.replaceState({}, '', '/')
    }
  }, [])

  const connectGoogle = async () => {
    setLoading(true)

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      alert('Je bent niet ingelogd')
      setLoading(false)
      return
    }

    window.location.href =
      `/api/google/auth?access_token=${session.access_token}`
  }

  if (connected === null) return null

  if (connected) {
    return (
      <div className="border px-3 py-2 rounded text-sm text-green-700 bg-green-50 inline-block">
        ✅ Agenda gekoppeld
      </div>
    )
  }

  return (
    <button
      onClick={connectGoogle}
      disabled={loading}
      className="border px-3 py-2 rounded inline-block"
    >
      {loading ? 'Bezig…' : '📅 Koppel Google Agenda'}
    </button>
  )
}
