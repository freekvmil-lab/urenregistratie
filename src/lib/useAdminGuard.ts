'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type UseAdminGuardResult = {
  allowed: boolean | null
}

export function useAdminGuard(): UseAdminGuardResult {
  const [allowed, setAllowed] = useState<boolean | null>(null)

  useEffect(() => {
    let mounted = true

    const check = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!mounted) return

        if (!user) {
          setAllowed(false)
          return
        }

        const { data: profile, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle()

        if (!mounted) return

        if (error) {
          console.warn('admin role check failed', error)
          setAllowed(false)
          return
        }

        setAllowed(profile?.role === 'admin')
      } catch (e) {
        console.warn('admin role check crashed', e)
        if (mounted) setAllowed(false)
      }
    }

    check()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      setAllowed(null)
      check()
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  return { allowed }
}
