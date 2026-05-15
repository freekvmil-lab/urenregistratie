'use client'

import { useAdminGuard } from '@/lib/useAdminGuard'
import CaoProfielen from '@/components/CaoProfielen'

export default function CaoPage() {
  const { allowed } = useAdminGuard()
  if (allowed === null) return <p>Controleren…</p>
  if (!allowed) return <p>Geen toegang</p>
  return <CaoProfielen />
}
