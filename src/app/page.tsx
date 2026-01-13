'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import TimeTracker from '@/components/TimeTracker'
import MyOverview from '@/components/MyOverview'
import MonthOverview from '@/components/MonthOverview'
import Link from 'next/link'
import GoogleAgendaButton from '@/components/GoogleAgendaButton'



export default function HomePage() {
  const [user, setUser] = useState<any>(null)
  const [ready, setReady] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    // 1️⃣ Check bestaande sessie
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setReady(true)

      if (data.session?.user) {
        loadRole(data.session.user.id)
      }
    })

    // 2️⃣ Luister naar auth changes (CRUCIAAL voor PWA/iOS)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setReady(true)

      if (session?.user) {
        loadRole(session.user.id)
      } else {
        setIsAdmin(false)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const loadRole = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()

    setIsAdmin(data?.role === 'admin')
  }

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
    <div className="p-6 space-y-6">
      {/* 🔝 Actie knoppen */}
      <div className="flex items-center gap-4">
        <span className="font-semibold">
          Welkom {user.email}
        </span>

        {isAdmin && (
          <Link
            href="/admin"
            className="px-3 py-1 rounded
              bg-blue-600 text-white text-sm"
          >
            Admin
          </Link>
        )}

        <button
          onClick={async () => {
            await supabase.auth.signOut()
            window.location.href = '/login'
          }}
          className="ml-auto text-sm underline"
        >
          Uitloggen
        </button>
      </div>

      <GoogleAgendaButton userId={user.id} />

      {/* ⏱ Time tracking */}
      <TimeTracker userId={user.id} />

      {/* 🗓️ Maand overzicht */}
      <MonthOverview userId={user.id} />

      {/* 📊 Overzicht */}
      <MyOverview userId={user.id} />
    </div>
  )
}
