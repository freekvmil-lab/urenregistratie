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
}

export default function WorkButton({
  userId,
  activeEntry,
  onUpdate,
}: Props) {
  const [loading, setLoading] = useState(false)

  const startWork = async () => {
    setLoading(true)
    await supabase.from('time_entries').insert({
      user_id: userId,
      date: new Date().toISOString().slice(0, 10),
      start_time: new Date().toISOString(),
    })
    setLoading(false)
    onUpdate()
  }

  const stopWork = async () => {
    if (!activeEntry) return
    setLoading(true)

    await supabase
      .from('time_entries')
      .update({
        end_time: new Date().toISOString(),
      })
      .eq('id', activeEntry.id)

    setLoading(false)
    onUpdate()
  }

  if (activeEntry) {
    const start = new Date(activeEntry.start_time)
    const time = start.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })

    return (
      <button
        onClick={stopWork}
        disabled={loading}
        className="fixed bottom-6 right-6 w-20 h-20 rounded-full bg-red-600 text-white flex flex-col items-center justify-center shadow-lg active:scale-95 transition"
      >
        <span className="text-xs">STOP</span>
        <span className="text-[10px] opacity-80">
          sinds {time}
        </span>
      </button>
    )
  }

  return (
    <button
      onClick={startWork}
      disabled={loading}
      className="fixed bottom-6 right-6 w-20 h-20 rounded-full bg-green-600 text-white flex items-center justify-center shadow-lg active:scale-95 transition animate-pulse"
    >
      START
    </button>
  )
}
