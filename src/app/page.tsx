'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import TimeTracker from '@/components/TimeTracker'
import MyOverview from '@/components/MyOverview'

export default function HomePage() {
  const [user, setUser] = useState<any>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // 1️⃣ Check bestaande sessie
    console.log('PWA auth effect start')
    supabase.auth.getSession().then(({ data }) => {
      console.log('getSession result:', data)
      setUser(data.session?.user ?? null)
      setReady(true)
    })

    // 2️⃣ Luister naar auth changes (CRUCIAAL voor PWA/iOS)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('auth state change:', event, session)
      setUser(session?.user ?? null)
      setReady(true)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  // ⛔ Nooit eeuwige loading
  if (!ready) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p>Loading…</p>
      </div>
    )
  }

  // 🔐 Niet ingelogd
  if (!user) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4">
        <p>Je bent niet ingelogd</p>
        <a
          href="/login"
          className="bg-black text-white px-4 py-2 rounded"
        >
          Inloggen
        </a>
      </div>
    )
  }

  // ✅ Ingelogd
  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-4">
        Welkom {user.email}
      </h1>
      <TimeTracker userId={user.id} />
      <MyOverview userId={user.id} />
    </div>
  )
}
