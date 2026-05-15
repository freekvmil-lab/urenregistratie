'use client'

import { Suspense } from 'react'
import { useAdminGuard } from '@/lib/useAdminGuard'
import PlanningBeheer from '@/components/PlanningBeheer'

export default function PlanningPage() {
  const { allowed } = useAdminGuard()
  if (allowed === null) return <p>Controleren…</p>
  if (!allowed) return <p>Geen toegang</p>
  return <Suspense><PlanningBeheer /></Suspense>
}
