'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function GoogleAgendaButton() {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)

  const loadStatus = () => {
    fetch('/api/google/status', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setConnected(d.connected))
      .catch(() => setConnected(false))
  }

  useEffect(() => {
    loadStatus()
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

    // 🔑 expliciet access_token meesturen
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
