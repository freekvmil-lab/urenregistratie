'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Profile {
  id: string
  name?: string
  email?: string
  role: 'admin' | 'employee' | 'sub-contractor'
}

interface AddHoursModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export default function AddHoursModal({ isOpen, onClose, onSuccess }: AddHoursModalProps) {
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<Profile | null>(null)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('17:00')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const fetchCurrentUser = async (): Promise<Profile | null> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, name, email, role')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile) return null

    const current = profile as Profile
    setCurrentUser(current)
    return current
  }

  const fetchUsers = async () => {
    setLoading(true)
    setMessage(null)

    // Fetch current user and use it directly to avoid stale state reads.
    const profile = await fetchCurrentUser()
    if (!profile) {
      setUsers([])
      setLoading(false)
      return
    }

    // For admins: show all employees and sub-contractors
    // For sub-contractors: show themselves and their assigned employees
    const isAdmin = profile.role === 'admin'

    let query = supabase
      .from('profiles')
      .select('id, name, email, role')
      .is('deleted_at', null)
      .order('name')

    if (!isAdmin && profile.role === 'sub-contractor') {
      // Sub-contractor: can only manage themselves and their assigned employees
      const { data: assignments } = await supabase
        .from('sub_contractor_assignments')
        .select('employee_id')
        .eq('sub_contractor_id', profile.id)

      const assignedIds = assignments?.map((a: any) => a.employee_id) ?? []
      const allowedIds = [profile.id, ...assignedIds]

      if (allowedIds.length > 0) {
        query = query.in('id', allowedIds)
      }
    }

    const { data } = await query
    const rows = (data ?? []) as Profile[]
    setUsers(rows)
    if (selectedEmployeeId && !rows.some((u) => u.id === selectedEmployeeId)) {
      setSelectedEmployeeId('')
    }
    setLoading(false)
  }

  useEffect(() => {
    if (isOpen) {
      fetchUsers()
    } else {
      setMessage(null)
    }
  }, [isOpen])

  const addManualHours = async () => {
    setMessage(null)

    if (!selectedEmployeeId) {
      setMessage('Selecteer een medewerker.')
      return
    }

    if (!startTime || !endTime) {
      setMessage('Vul start- en eindtijd in.')
      return
    }

    // Parse times
    const [startHour, startMin] = startTime.split(':').map(Number)
    const [endHour, endMin] = endTime.split(':').map(Number)
    const startDate = new Date(selectedDate)
    const endDate = new Date(selectedDate)

    startDate.setHours(startHour, startMin, 0, 0)
    endDate.setHours(endHour, endMin, 0, 0)

    if (startDate >= endDate) {
      setMessage('Eindtijd moet na starttijd zijn.')
      return
    }

    setSaving(true)

    try {
      const { error } = await supabase
        .from('time_entries')
        .insert({
          user_id: selectedEmployeeId,
          start_time: startDate.toISOString(),
          end_time: endDate.toISOString(),
          date: selectedDate,
          approved: false,
        })

      if (error) throw error

      setMessage('Uren succesvol toegevoegd.')
      // Reset form
      setTimeout(() => {
        setSelectedEmployeeId('')
        setStartTime('09:00')
        setEndTime('17:00')
        setSelectedDate(new Date().toISOString().split('T')[0])
        setMessage(null)
        onClose()
        onSuccess?.()
      }, 800)
    } catch (err: any) {
      setMessage(err?.message ?? 'Toevoegen mislukt.')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  const canManuallyAdd = currentUser?.role === 'admin' || currentUser?.role === 'sub-contractor'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      <div className="relative w-full max-w-md rounded border border-orange-200/60 dark:border-orange-500/30 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-xl">
        <div className="flex items-start justify-between gap-4 p-4 border-b border-orange-200/60 dark:border-orange-500/30">
          <div>
            <div className="text-lg font-bold">Uren Toevoegen</div>
            <div className="text-sm opacity-80">Voeg handmatig uren toe</div>
          </div>
          <button
            onClick={onClose}
            className="px-2 py-1 rounded border border-orange-200/60 dark:border-orange-500/30 hover:bg-orange-50 dark:hover:bg-white/5"
          >
            ✕
          </button>
        </div>

        <div className="p-4">
          {!canManuallyAdd ? (
            <div className="p-3 rounded bg-orange-50/30 dark:bg-transparent border border-orange-200/60 dark:border-orange-500/30 text-sm">
              <p className="text-gray-700 dark:text-gray-300">
                U hebt geen toestemming om handmatig uren toe te voegen.
              </p>
            </div>
          ) : loading ? (
            <p className="text-sm opacity-70">Laden…</p>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm mb-1 text-gray-700 dark:text-gray-200">Medewerker</label>
                <select
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  disabled={saving}
                  className="w-full border rounded px-2 py-1 bg-white text-gray-900 border-gray-300 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700"
                >
                  <option value="">-- Selecteer --</option>
                  {users.map((u: Profile) => (
                    <option key={u.id} value={u.id}>
                      {u.name || u.email || u.id}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm mb-1 text-gray-700 dark:text-gray-200">Datum</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  disabled={saving}
                  className="w-full border rounded px-2 py-1 bg-transparent text-gray-900 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm mb-1 text-gray-700 dark:text-gray-200">Starttijd</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  disabled={saving}
                  className="w-full border rounded px-2 py-1 bg-transparent text-gray-900 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm mb-1 text-gray-700 dark:text-gray-200">Eindtijd</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  disabled={saving}
                  className="w-full border rounded px-2 py-1 bg-transparent text-gray-900 dark:text-gray-100"
                />
              </div>

              {message && (
                <div
                  className={`p-2 rounded text-sm ${
                    message.includes('succesvol')
                      ? 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300'
                      : 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300'
                  }`}
                >
                  {message}
                </div>
              )}

              <button
                onClick={addManualHours}
                disabled={saving || !selectedEmployeeId}
                className="w-full px-4 py-2 rounded bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50"
              >
                {saving ? 'Toevoegen…' : 'Uren toevoegen'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
