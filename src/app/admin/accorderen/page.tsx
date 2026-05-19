'use client'

import { useAdminGuard } from '@/lib/useAdminGuard'
import AccordeerOverzicht from '@/components/AccordeerOverzicht'

export default function AccordeerPage() {
  const { allowed } = useAdminGuard()
  if (allowed === null) return <p>Controleren…</p>
  if (!allowed) return <p>Geen toegang</p>
  return <AccordeerOverzicht />
}
