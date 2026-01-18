'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { usePathname } from 'next/navigation'

export default function Navbar() {
  const pathname = usePathname()
  const [isAdmin, setIsAdmin] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUserEmail(user?.email ?? null)

      if (!user) {
        setIsAdmin(false)
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      setIsAdmin(profile?.role === 'admin')
    }

    load()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      load()
    })

    return () => subscription.unsubscribe()
  }, [])

  const links = useMemo(() => {
    const base = [{ href: '/', label: 'Home', adminOnly: false }]
    const adminLinks = [
      { href: '/admin', label: 'Admin', adminOnly: true },
      { href: '/admin/roles', label: 'Werknemers', adminOnly: true },
      { href: '/admin/export', label: 'Export', adminOnly: true },
      { href: '/admin/clients', label: 'Opdrachtgevers', adminOnly: true },
    ]
    return [...base, ...adminLinks]
  }, [])

  const linkClass = (href: string) => {
    const active = pathname === href
    return (
      'text-sm px-2 py-1 rounded border transition-colors ' +
      (active
        ? 'bg-orange-50 dark:bg-orange-500/10 border-orange-300/60 text-orange-800 dark:text-orange-200'
        : 'border-transparent text-gray-900 dark:text-white hover:bg-orange-500/10 hover:border-orange-300/40')
    )
  }

  return (
    <nav className="sticky top-0 z-50 flex items-center gap-2 px-6 py-3
      bg-white/90 dark:bg-gray-900/90 backdrop-blur
      border-b border-orange-200/70 dark:border-orange-500/30">

      <Link href="/" className="font-semibold text-gray-900 dark:text-gray-100 mr-2">
        Vortexx
      </Link>

      <div className="inline-flex gap-1 items-center">
        {links
          .filter((l) => !l.adminOnly || isAdmin)
          .map((l) => (
            <Link key={l.href} href={l.href} className={linkClass(l.href)}>
              {l.label}
            </Link>
          ))}
      </div>

      <div className="ml-auto flex items-center gap-3">
        {userEmail ? (
          <span className="text-xs text-gray-600 dark:text-gray-300 truncate max-w-[220px]">
            {userEmail}
          </span>
        ) : (
          <Link href="/login" className={linkClass('/login')}>
            Inloggen
          </Link>
        )}

        {userEmail && (
          <button
            onClick={async () => {
              await supabase.auth.signOut()
              window.location.href = '/login'
            }}
            className="text-sm underline text-gray-900 dark:text-gray-100"
          >
            Uitloggen
          </button>
        )}
      </div>
    </nav>
  )
}
