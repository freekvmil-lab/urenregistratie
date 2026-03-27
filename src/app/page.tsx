'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import MyOverview from '@/components/MyOverview'
import MonthOverview from '@/components/MonthOverview'
import AgendaSuggestions from '@/components/AgendaSuggestions'
import GoogleAgendaButton from '@/components/GoogleAgendaButton'



export default function HomePage() {
  const [user, setUser] = useState<any>(null)
  const [canManageOthers, setCanManageOthers] = useState(false)
  const [ready, setReady] = useState(false)
  const [showMonthOverview, setShowMonthOverview] = useState(false)
  const [showAgendaSuggestions, setShowAgendaSuggestions] = useState(false)

  const fetchRoleAccess = async (userId: string | null | undefined) => {
    if (!userId) {
      setCanManageOthers(false)
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle()

    const role = String((profile as any)?.role ?? '')
    setCanManageOthers(role === 'admin' || role === 'sub-contractor')
  }

  useEffect(() => {
    // 1️⃣ Check bestaande sessie
    supabase.auth.getSession().then(({ data }) => {
      const nextUser = data.session?.user ?? null
      setUser(nextUser)
      fetchRoleAccess(nextUser?.id)
      setReady(true)
    })

    // 2️⃣ Luister naar auth changes (CRUCIAAL voor PWA/iOS)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null
      setUser(nextUser)
      fetchRoleAccess(nextUser?.id)
      setReady(true)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const todayLocalYmd = () => {
    const d = new Date()
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
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
    <div className="px-4 py-4 sm:p-6 space-y-6">
      <header className="space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Dashboard</h1>
          <div className="text-xs text-gray-500 dark:text-gray-400">Ingelogd als {user.email}</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              const ev = new CustomEvent('openManual', {
                detail: { date: todayLocalYmd() },
              })
              window.dispatchEvent(ev)
            }}
            className="border border-orange-500/60 hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10 px-3 py-1 rounded"
          >
            ➕ Uren toevoegen
          </button>

          {canManageOthers && (
            <button
              onClick={() => {
                const ev = new CustomEvent('openManualForEmployee', {
                  detail: { date: todayLocalYmd() },
                })
                window.dispatchEvent(ev)
              }}
              className="border border-blue-500/60 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 px-3 py-1 rounded"
            >
              ➕👷 Uren toevoegen werknemer
            </button>
          )}

          <button
            onClick={() => setShowMonthOverview((v) => !v)}
            className="border border-orange-500/60 hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10 px-3 py-1 rounded"
          >
            {showMonthOverview ? '📅 Maandoverzicht verbergen' : '📅 Maandoverzicht tonen'}
          </button>

          <button
            onClick={() => setShowAgendaSuggestions((v) => !v)}
            className="border border-orange-500/60 hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10 px-3 py-1 rounded"
          >
            {showAgendaSuggestions ? '🗓️ Agenda verbergen' : '🗓️ Agenda ophalen'}
          </button>

          {/* Subtielere agenda status */}
          <GoogleAgendaButton userId={user.id} variant="subtle" />
        </div>
      </header>

      {/* 🗓️ Maand overzicht */}
      {showMonthOverview && <MonthOverview userId={user.id} />}

      {/* 🗓️ Agenda suggesties */}
      {showAgendaSuggestions && (
        <section className="bg-black/30 border border-gray-700 rounded-lg p-4 space-y-3">
          <AgendaSuggestions
            onUse={(e) => {
              const ev = new CustomEvent('openManualPrefill', {
                detail: {
                  start: e.start,
                  end: e.end,
                  title: e.title,
                  location: e.location ?? null,
                  isAllDay: (e as any).isAllDay ?? false,
                },
              })
              window.dispatchEvent(ev)
            }}
          />
        </section>
      )}

      {/* 📊 Overzicht */}
      <MyOverview userId={user.id} />
    </div>
  )
}
