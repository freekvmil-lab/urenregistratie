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
      <h1 className="text-2xl font-bold mb-4">Opdrachtgevers</h1>

      <ClientManagement />
    </main>
  )
}
