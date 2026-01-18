'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function GoogleAgendaButton({
  userId,
  variant = 'default',
}: {
  userId: string
  variant?: 'default' | 'subtle'
}) {
  const [connected, setConnected] = useState<boolean | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('google_accounts')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle()

      setConnected(!!data)
    }

    load()
  }, [userId])

  if (connected === null) return null

  if (connected) {
    if (variant === 'subtle') {
      return (
        <div className="border border-orange-200 bg-orange-50 text-orange-800 px-2 py-1 rounded text-xs">
          Google Agenda gekoppeld
        </div>
      )
    }

    return (
      <div className="border px-3 py-2 rounded text-sm text-orange-700 bg-orange-50 inline-block">
        ✅ Agenda gekoppeld
      </div>
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
