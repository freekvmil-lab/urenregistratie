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

  /* =======================
     START WORK
  ======================= */

  const startWork = async () => {
    if (!userId) return
    setLoading(true)

    // 🔒 Check of er al een actieve entry bestaat
    const { data: existing, error: checkError } =
      await supabase
        .from('time_entries')
        .select('id')
        .eq('user_id', userId)
        .is('end_time', null)
        .maybeSingle()

    if (checkError) {
      console.error('Active check error:', checkError)
      setLoading(false)
      return
    }

    if (existing) {
      alert(
        'Je bent al gestart. Stop eerst je huidige werkdag.'
      )
      setLoading(false)
      return
    }

    const today = new Date().toISOString().slice(0, 10)

    const { error } = await supabase
      .from('time_entries')
      .insert({
        user_id: userId,
        date: today,
        start_time: new Date().toISOString(),

        // expliciet type entry
        manual: false,
        edited: false,
        approved: true,

        // optioneel maar veilig
        client: null,
        location: null,
        kilometers: null,
        parking_paid: false,
        parking_cost: null,
      })

    if (error) {
      console.error('startWork error:', error)
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

  if (activeEntry) {
    const start = new Date(activeEntry.start_time)
    const time = start.toLocaleTimeString('nl-NL', {
      hour: '2-digit',
      minute: '2-digit',
    })

    return (
      <button
        onClick={stopWork}
        disabled={loading}
        className="
          fixed bottom-6 right-6
          w-20 h-20
          rounded-full
          bg-red-600 text-white
          flex flex-col items-center justify-center
          shadow-lg
          active:scale-95
          transition
        "
      >
        <span className="text-xs font-semibold">
          STOP
        </span>
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
      className="
        fixed bottom-6 right-6
        w-20 h-20
        rounded-full
        bg-green-600 text-white
        flex items-center justify-center
        shadow-lg
        active:scale-95
        transition
        animate-pulse
        font-semibold
      "
    >
      START
    </button>
  )
}
