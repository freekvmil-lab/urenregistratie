"use client"

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ClientManagement from '@/components/ClientManagement'

export default function ClientsPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null)

  useEffect(() => {
    const checkRole = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setAllowed(false)
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      setAllowed(profile?.role === 'admin')
    }

    checkRole()
  }, [])

  if (allowed === null) return <p>Controleren…</p>
  if (!allowed) return <p>Geen toegang</p>

  return (
    <main className="p-6">
      <nav className="flex gap-3 items-center mb-4">
        <div className="inline-flex gap-2 items-center bg-gray-100 dark:bg-gray-800 rounded px-2 py-1">
          <a href="/" className="text-sm text-gray-900 dark:text-white px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700">Home</a>
          <a href="/admin/roles" className="text-sm text-gray-900 dark:text-white px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700">Rolbeheer</a>
          <a href="/admin/export" className="text-sm text-gray-900 dark:text-white px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700">Export</a>
          <a href="/admin/clients" className="text-sm font-semibold text-gray-900 dark:text-white px-2 py-1 rounded bg-gray-200 dark:bg-gray-700">Opdrachtgevers</a>
          <a href="/admin" className="text-sm text-gray-900 dark:text-white px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700">Admin</a>
        </div>
      </nav>

      <h1 className="text-2xl font-bold mb-4">Opdrachtgevers</h1>

      <ClientManagement />
    </main>
  )
}
