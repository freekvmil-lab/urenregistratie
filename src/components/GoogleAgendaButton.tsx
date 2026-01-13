'use client'

import { useEffect, useState } from 'react'

export default function GoogleAgendaButton() {
  const [connected, setConnected] = useState<boolean | null>(null)

  const loadStatus = () => {
    fetch('/api/google/status', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setConnected(d.connected))
      .catch(() => setConnected(false))
  }

  useEffect(() => {
    loadStatus()
  }, [])

  if (connected === null) return null

  if (connected) {
    return (
      <div className="border px-3 py-2 rounded text-sm text-green-700 bg-green-50 inline-block">
        ✅ Agenda gekoppeld
      </div>
    )
  }

  return (
    <a
      href="/api/google/auth"
      onClick={() => {
        // kleine delay zodat callback kan opslaan
        setTimeout(loadStatus, 3000)
      }}
      className="border px-3 py-2 rounded inline-block"
    >
      📅 Koppel Google Agenda
    </a>
  )
}
