'use client'
import { useAdminGuard } from '@/lib/useAdminGuard'
import OvereenkomstenBeheer from '@/components/OvereenkomstenBeheer'

export default function OvereenkomstenPage() {
  const { allowed } = useAdminGuard()
  if (allowed === null) return <p>Controleren…</p>
  if (!allowed) return <p>Geen toegang</p>
  return <OvereenkomstenBeheer />
}
