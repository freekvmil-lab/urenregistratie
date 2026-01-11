'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function Navbar() {
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    const loadRole = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      setIsAdmin(profile?.role === 'admin')
    }

    loadRole()
  }, [])

  return (
    <nav className="flex items-center gap-4 px-6 py-4
      bg-white dark:bg-gray-900
      border-b border-gray-300 dark:border-gray-700">

      <Link
        href="/"
        className="font-semibold text-gray-900 dark:text-gray-100"
      >
        Mijn uren
      </Link>

      {isAdmin && (
        <Link
          href="/admin"
          className="font-semibold text-gray-900 dark:text-gray-100"
        >
          Admin
        </Link>
      )}

      <button
        onClick={async () => {
          await supabase.auth.signOut()
          window.location.href = '/login'
        }}
        className="ml-auto text-sm underline
          text-gray-900 dark:text-gray-100"
      >
        Uitloggen
      </button>
    </nav>
  )
}
