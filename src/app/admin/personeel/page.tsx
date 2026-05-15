'use client'

import { useAdminGuard } from '@/lib/useAdminGuard'
import PersoneelBeheer from '@/components/PersoneelBeheer'

export default function PersoneelPage() {
  const { allowed } = useAdminGuard()
  if (allowed === null) return <p>Controleren…</p>
  if (!allowed) return <p>Geen toegang</p>
  return <PersoneelBeheer />
}
