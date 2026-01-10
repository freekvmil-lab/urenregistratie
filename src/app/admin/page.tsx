'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AdminDashboard from '@/components/AdminDashboard'

export default function AdminPage() {
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

  return <AdminDashboard />
}
