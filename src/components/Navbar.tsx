'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { usePathname } from 'next/navigation'

export default function Navbar() {
  const pathname = usePathname()
  const [isAdmin, setIsAdmin] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [employeeLinksCollapsed, setEmployeeLinksCollapsed] = useState(true)

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

  const employeeLinks = useMemo(() => {
    return [
      { href: '/', label: 'Uren', adminOnly: false },
      { href: '/agenda', label: 'Agenda', adminOnly: false },
      { href: '/availability', label: 'Beschikbaarheid', adminOnly: false },
      { href: '/intranet', label: 'Intranet', adminOnly: false },
      { href: '/settings/notifications', label: 'Notificaties', adminOnly: false },
    ]
  }, [])

  const adminLinks = useMemo(() => {
    return [
      { href: '/admin', label: 'Uren', adminOnly: true },
      { href: '/admin/availability', label: 'Beschikbaarheid', adminOnly: true },
      { href: '/admin/roles', label: 'Werknemers', adminOnly: true },
      { href: '/admin/clients', label: 'Opdrachtgevers', adminOnly: true },
      { href: '/admin/push', label: 'Push', adminOnly: true },
      { href: '/admin/export', label: 'Export', adminOnly: true },
    ]
  }, [])

  const linkClass = (href: string) => {
    const active = pathname === href
    return (
      'text-sm px-3 py-1.5 rounded-full border transition-all whitespace-nowrap select-none ' +
      'ring-1 ring-inset ring-black/5 ' +
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-black/60 focus-visible:ring-offset-2 focus-visible:ring-offset-orange-500 ' +
      (active
        ? 'bg-black text-white border-black/70 shadow-sm'
        : 'bg-white/10 border-black/15 text-black hover:bg-white/20 hover:border-black/25 hover:shadow-sm')
    )
  }

  return (
    <nav className="sticky top-0 z-50 bg-orange-500/95 backdrop-blur border-b border-black/20">
      <div className="px-3 py-2.5 sm:px-6 sm:py-3">
        <div className="flex items-center gap-3">
          <Link href="/" className="font-semibold text-black mr-2 shrink-0 tracking-tight">
            Vortexx
          </Link>

          <div className="ml-auto flex items-center gap-3 min-w-0">
            {userEmail ? (
              <span className="text-xs text-black/80 truncate max-w-[140px] sm:max-w-[240px]">
                {userEmail}
              </span>
            ) : (
              <Link href="/login" className={linkClass('/login')} aria-current={pathname === '/login' ? 'page' : undefined}>
                Inloggen
              </Link>
            )}

            {userEmail && (
              <button
                onClick={async () => {
                  await supabase.auth.signOut()
                  window.location.href = '/login'
                }}
                className="text-sm px-3 py-1.5 rounded-full border border-black/15 bg-white/10 hover:bg-white/20 hover:shadow-sm text-black shrink-0 transition-all ring-1 ring-inset ring-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/60 focus-visible:ring-offset-2 focus-visible:ring-offset-orange-500"
              >
                Uitloggen
              </button>
            )}
          </div>
        </div>

        <div className="mt-2 sm:mt-3 -mx-3 px-3 sm:mx-0 sm:px-0 overflow-x-auto">
          <div className="inline-flex gap-2 items-center whitespace-nowrap pb-1">
            {!isAdmin &&
              employeeLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={linkClass(l.href)}
                  aria-current={pathname === l.href ? 'page' : undefined}
                >
                  {l.label}
                </Link>
              ))}

            {isAdmin && (
              <>
                <button
                  onClick={() => setEmployeeLinksCollapsed((v) => !v)}
                  className="text-xs px-2 py-1 rounded-full border border-black/15 bg-white/10 hover:bg-white/20 text-black transition-all"
                  aria-expanded={!employeeLinksCollapsed}
                  aria-label="Werknemer links inklappen of uitklappen"
                >
                  {employeeLinksCollapsed ? 'Werknemer ▸' : 'Werknemer ▾'}
                </button>

                {!employeeLinksCollapsed &&
                  employeeLinks.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      className={linkClass(l.href)}
                      aria-current={pathname === l.href ? 'page' : undefined}
                    >
                      {l.label}
                    </Link>
                  ))}

                <div className="h-6 w-px bg-black/30 mx-1" aria-hidden="true" />

                {adminLinks.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={linkClass(l.href)}
                    aria-current={pathname === l.href ? 'page' : undefined}
                  >
                    {l.label}
                  </Link>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
