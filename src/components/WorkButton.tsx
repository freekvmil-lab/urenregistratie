'use client'

import { supabase } from '@/lib/supabase'
import { useState } from 'react'

interface Props {
  userId: string
  activeEntry: {
    id: number
    start_time: string
  } | null
  onUpdate: () => void
  inline?: boolean
}

export default function WorkButton({
  userId,
  activeEntry,
  onUpdate,
  inline = false,
}: Props) {
  const [loading, setLoading] = useState(false)

  /* =======================
     START WORK
  ======================= */

  const startWork = async () => {
    if (!userId) return
    setLoading(true)

    // 🔒 check op bestaande actieve entry
    const { data: existing, error } = await supabase
      .from('time_entries')
      .select('id')
      .eq('user_id', userId)
      .is('end_time', null)
      .order('start_time', { ascending: false })
      .limit(1)

    if (error) {
      console.error('Active check error:', error)
      setLoading(false)
      return
    }

    if (existing && existing.length > 0) {
      alert('Je bent al gestart. Stop eerst je huidige werk.')
      setLoading(false)
      return
    }

    const today = new Date().toISOString().slice(0, 10)

    const { error: insertError } = await supabase
      .from('time_entries')
      .insert({
        user_id: userId,
        date: today,
        start_time: new Date().toISOString(),
        manual: false,
        edited: true,
        approved: false,
      })

    if (insertError) {
      console.error('startWork error:', insertError)
    }

    setLoading(false)
    onUpdate()
  }

  /* =======================
     STOP WORK
  ======================= */

  const stopWork = async () => {
    if (!activeEntry) return
    setLoading(true)

    const { error } = await supabase
      .from('time_entries')
      .update({
        end_time: new Date().toISOString(),
      })
      .eq('id', activeEntry.id)

    if (error) {
      console.error('stopWork error:', error)
    }

    setLoading(false)
    onUpdate()
  }

  /* =======================
     RENDER
  ======================= */

  if (!inline) {
    return null
  }

  if (activeEntry) {
    const start = new Date(activeEntry.start_time)
    const time = start.toLocaleTimeString('nl-NL', {
      hour: '2-digit',
      minute: '2-digit',
    })
    return (
      <button onClick={stopWork} disabled={loading} className="px-3 py-1 bg-red-600 text-white rounded">
        STOP (sinds {time})
      </button>
    )
  }
  return (
    <button onClick={startWork} disabled={loading} className="px-3 py-1 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded">START</button>
  )
}
