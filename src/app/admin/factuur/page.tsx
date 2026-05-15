'use client'

import { useAdminGuard } from '@/lib/useAdminGuard'
import FactuurOverzicht from '@/components/FactuurOverzicht'

export default function FactuurPage() {
  const { allowed } = useAdminGuard()
  if (allowed === null) return <p>Controleren…</p>
  if (!allowed) return <p>Geen toegang</p>
  return <FactuurOverzicht />
}
