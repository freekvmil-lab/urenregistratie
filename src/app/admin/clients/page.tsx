"use client"

import { useAdminGuard } from '@/lib/useAdminGuard'
import ClientManagement from '@/components/ClientManagement'

export default function ClientsPage() {
  const { allowed } = useAdminGuard()

  if (allowed === null) return <p>Controleren…</p>
  if (!allowed) return <p>Geen toegang</p>

  return (
    <main className="px-4 py-4 sm:p-6">
      <h1 className="text-2xl font-bold mb-4">Opdrachtgevers</h1>

      <ClientManagement />
    </main>
  )
}
