'use client'

import SubContractorAssignments from '@/components/SubContractorAssignments'
import { useAdminGuard } from '@/lib/useAdminGuard'

export default function SubContractorAssignmentsPage() {
  const { allowed } = useAdminGuard()

  if (allowed === null) return <p>Controleren…</p>
  if (!allowed) return <p>Geen toegang</p>

  return (
    <main className="px-4 py-4 sm:p-6">
      <h1 className="text-2xl font-bold mb-4">Sub-Contractor Toewijzingen</h1>
      <SubContractorAssignments />
    </main>
  )
}
