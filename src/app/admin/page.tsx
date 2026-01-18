'use client'

import { useAdminGuard } from '@/lib/useAdminGuard'
import AdminDashboard from '@/components/AdminDashboard'

export default function AdminPage() {
  const { allowed } = useAdminGuard()

  if (allowed === null) return <p>Controleren…</p>
  if (!allowed) return <p>Geen toegang</p>

  return <AdminDashboard />
}
