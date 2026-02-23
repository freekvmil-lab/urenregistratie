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
    const base = [
      { href: '/', label: 'Uren', adminOnly: false },
      { href: '/agenda', label: 'Agenda', adminOnly: false },
      { href: '/intranet', label: 'Intranet', adminOnly: false },
      { href: '/availability', label: 'Beschikbaarheid', adminOnly: false },
    ]
    const adminLinks = [
      { href: '/admin', label: 'Admin', adminOnly: true },
      { href: '/admin/roles', label: 'Werknemers', adminOnly: true },
      { href: '/admin/availability', label: 'Beschikbaarheid', adminOnly: true },
      { href: '/admin/export', label: 'Export', adminOnly: true },
      { href: '/admin/clients', label: 'Opdrachtgevers', adminOnly: true },
    ]
    return [...base, ...adminLinks]
  }, [])

  const linkClass = (href: string) => {
    const active = pathname === href
    return (
      'text-sm px-2 py-1 rounded border transition-colors whitespace-nowrap ' +
      (active
        ? 'bg-black/10 border-black/30 text-black'
        : 'border-transparent text-black hover:bg-black/10 hover:border-black/20')
    )
  }

  return (
    <nav className="sticky top-0 z-50 bg-orange-500 backdrop-blur border-b border-black/20">
      <div className="px-3 py-2 sm:px-6 sm:py-3">
        <div className="flex items-center gap-2">
          <Link href="/" className="font-semibold text-black mr-2 shrink-0">
            Vortexx
          </Link>

          <div className="ml-auto flex items-center gap-3 min-w-0">
            {userEmail ? (
              <span className="text-xs text-black/80 truncate max-w-[140px] sm:max-w-[220px]">
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
                className="text-sm underline text-black shrink-0"
              >
                Uitloggen
              </button>
            )}
          </div>
        </div>

        <div className="mt-2 sm:mt-0 -mx-3 px-3 sm:mx-0 sm:px-0 overflow-x-auto">
          <div className="inline-flex gap-1 items-center whitespace-nowrap">
            {links
              .filter((l) => !l.adminOnly || isAdmin)
              .map((l) => (
                <Link key={l.href} href={l.href} className={linkClass(l.href)}>
                  {l.label}
                </Link>
              ))}
          </div>
        </div>
      </div>
    </nav>
  )
}
