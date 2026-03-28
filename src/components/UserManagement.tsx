'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const USER_MANAGEMENT_DRAFT_KEY = 'user-management-draft-v1'

interface Profile {
  id: string
  name: string | null
  email: string | null
  role: 'admin' | 'employee' | 'sub-contractor'
  hourly_rate?: number | null
  home_address?: string | null
  break_enabled?: boolean | null
  default_break_minutes?: number | null
}

interface Client {
  id: string
  name: string
}

type EmployeeDocument = {
  id: string
  employee_id: string
  filename: string
  object_path: string
  mime_type: string | null
  size_bytes: number | null
  uploaded_by: string | null
  created_at: string
}

type IntakeExtracted = {
  email: string | null
  name: string | null
  home_address: string | null
  confidence: 'low' | 'medium'
  warnings: string[]
}

function sanitizeFilename(name: string): string {
  const trimmed = String(name ?? '').trim()
  const base = trimmed || 'document'
  return base
    .replace(/[/\\]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[^a-zA-Z0-9 ._\-()]/g, '')
    .slice(0, 120)
}

export default function UserManagement() {
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  const [clients, setClients] = useState<Client[]>([])
  const [employeeClientIds, setEmployeeClientIds] = useState<Record<string, string[]>>({})

  const [createEmail, setCreateEmail] = useState('')
  const [createName, setCreateName] = useState('')
  const [createRole, setCreateRole] = useState<'admin' | 'employee' | 'sub-contractor'>('employee')
  const [createHourlyRate, setCreateHourlyRate] = useState('')
  const [createHomeAddress, setCreateHomeAddress] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [createMessage, setCreateMessage] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [docsForUser, setDocsForUser] = useState<Profile | null>(null)
  const [docsLoading, setDocsLoading] = useState(false)
  const [docsError, setDocsError] = useState<string | null>(null)
  const [docs, setDocs] = useState<EmployeeDocument[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null)

  const [intakeOpen, setIntakeOpen] = useState(false)
  const [intakeFile, setIntakeFile] = useState<File | null>(null)
  const [intakeExtracted, setIntakeExtracted] = useState<IntakeExtracted | null>(null)
  const [intakeEmail, setIntakeEmail] = useState('')
  const [intakeName, setIntakeName] = useState('')
  const [intakeAddress, setIntakeAddress] = useState('')
  const [intakeBusy, setIntakeBusy] = useState(false)
  const [intakeCreateBusy, setIntakeCreateBusy] = useState(false)
  const [intakeMessage, setIntakeMessage] = useState<string | null>(null)

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(USER_MANAGEMENT_DRAFT_KEY)
      if (!raw) return
      const draft = JSON.parse(raw) as {
        createEmail?: string
        createName?: string
        createRole?: 'admin' | 'employee' | 'sub-contractor'
        createHourlyRate?: string
        createHomeAddress?: string
      }

      if (typeof draft.createEmail === 'string') setCreateEmail(draft.createEmail)
      if (typeof draft.createName === 'string') setCreateName(draft.createName)
      if (draft.createRole === 'admin' || draft.createRole === 'employee' || draft.createRole === 'sub-contractor') {
        setCreateRole(draft.createRole)
      }
      if (typeof draft.createHourlyRate === 'string') setCreateHourlyRate(draft.createHourlyRate)
      if (typeof draft.createHomeAddress === 'string') setCreateHomeAddress(draft.createHomeAddress)
    } catch {
      // ignore corrupted draft
    }
  }, [])

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        USER_MANAGEMENT_DRAFT_KEY,
        JSON.stringify({
          createEmail,
          createName,
          createRole,
          createHourlyRate,
          createHomeAddress,
        })
      )
    } catch {
      // ignore quota/privacy mode errors
    }
  }, [createEmail, createName, createRole, createHourlyRate, createHomeAddress])

  const openIntake = () => {
    setIntakeOpen(true)
    setIntakeFile(null)
    setIntakeExtracted(null)
    setIntakeEmail('')
    setIntakeName('')
    setIntakeAddress('')
    setIntakeMessage(null)
  }

  const closeIntake = () => {
    setIntakeOpen(false)
    setIntakeFile(null)
    setIntakeExtracted(null)
    setIntakeEmail('')
    setIntakeName('')
    setIntakeAddress('')
    setIntakeMessage(null)
    setIntakeBusy(false)
    setIntakeCreateBusy(false)
  }

  const parseIntake = async (file: File) => {
    setIntakeBusy(true)
    setIntakeMessage(null)
    setIntakeExtracted(null)

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const accessToken = session?.access_token
      if (!accessToken) {
        setIntakeMessage('Niet ingelogd.')
        return
      }

      const fd = new FormData()
      fd.set('mode', 'parse')
      fd.set('file', file)

      const res = await fetch('/api/admin/intake', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: fd,
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setIntakeMessage(json?.details ? String(json.details) : json?.error ? String(json.error) : 'Inlezen mislukt')
        return
      }

      const extracted = json?.extracted as IntakeExtracted
      setIntakeExtracted(extracted)
      setIntakeEmail(String(extracted?.email ?? ''))
      setIntakeName(String(extracted?.name ?? ''))
      setIntakeAddress(String(extracted?.home_address ?? ''))
    } catch (e: any) {
      setIntakeMessage(String(e?.message ?? 'Inlezen mislukt'))
    } finally {
      setIntakeBusy(false)
    }
  }

  const createFromIntake = async () => {
    if (!intakeFile) {
      setIntakeMessage('Kies eerst het inschrijfformulier (PDF).')
      return
    }

    const email = intakeEmail.trim().toLowerCase()
    if (!email) {
      setIntakeMessage('E-mail is verplicht (controleer/verbeter de extractie).')
      return
    }

    setIntakeCreateBusy(true)
    setIntakeMessage(null)

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const accessToken = session?.access_token
      if (!accessToken) {
        setIntakeMessage('Niet ingelogd.')
        return
      }

      const fd = new FormData()
      fd.set('mode', 'create')
      fd.set('file', intakeFile)
      fd.set('email', email)
      fd.set('name', intakeName.trim())
      fd.set('home_address', intakeAddress.trim())

      const res = await fetch('/api/admin/intake', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: fd,
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setIntakeMessage(json?.details ? String(json.details) : json?.error ? String(json.error) : 'Aanmaken mislukt')
        return
      }

      const newId = String(json?.id ?? '')
      setIntakeMessage('Werknemer aangemaakt + formulier opgeslagen in documenten.')
      await fetchUsers()

      if (newId) {
        const newUser = users.find((u) => u.id === newId) ?? null
        if (newUser) await openDocs(newUser)
      }
    } catch (e: any) {
      setIntakeMessage(String(e?.message ?? 'Aanmaken mislukt'))
    } finally {
      setIntakeCreateBusy(false)
    }
  }

  const loadDocs = async (employeeId: string) => {
    setDocsLoading(true)
    setDocsError(null)
    try {
      const { data, error } = await supabase
        .from('employee_documents')
        .select('id, employee_id, filename, object_path, mime_type, size_bytes, uploaded_by, created_at')
        .eq('employee_id', employeeId)
        .order('created_at', { ascending: false })

      if (error) throw error
      setDocs((data ?? []) as EmployeeDocument[])
    } catch (e: any) {
      const msg = String(e?.message ?? 'Documenten laden mislukt')
      setDocsError(msg)
      setDocs([])
    } finally {
      setDocsLoading(false)
    }
  }

  const openDocs = async (u: Profile) => {
    setDocsForUser(u)
    setUploadFile(null)
    await loadDocs(u.id)
  }

  const closeDocs = () => {
    setDocsForUser(null)
    setDocsError(null)
    setDocs([])
    setUploadFile(null)
  }

  const downloadDoc = async (doc: EmployeeDocument) => {
    try {
      const { data, error } = await supabase
        .storage
        .from('employee-documents')
        .createSignedUrl(doc.object_path, 60)
      if (error) throw error

      const url = data?.signedUrl
      if (!url) throw new Error('Geen download URL')
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e: any) {
      alert(e?.message ?? 'Download mislukt')
    }
  }

  const uploadDoc = async () => {
    const employeeId = docsForUser?.id
    if (!employeeId) return
    if (!uploadFile) {
      setDocsError('Kies eerst een bestand.')
      return
    }

    setUploading(true)
    setDocsError(null)

    const file = uploadFile
    const docId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now())
    const safeName = sanitizeFilename(file.name)
    const objectPath = `employee/${employeeId}/${docId}/${safeName}`

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      const up = await supabase
        .storage
        .from('employee-documents')
        .upload(objectPath, file, { contentType: file.type || undefined, upsert: false })
      if (up.error) throw up.error

      const ins = await supabase
        .from('employee_documents')
        .insert({
          id: docId,
          employee_id: employeeId,
          filename: safeName,
          object_path: objectPath,
          mime_type: file.type || null,
          size_bytes: Number.isFinite(file.size) ? file.size : null,
          uploaded_by: user?.id ?? null,
        })
      if (ins.error) {
        await supabase.storage.from('employee-documents').remove([objectPath])
        throw ins.error
      }

      setUploadFile(null)
      await loadDocs(employeeId)
    } catch (e: any) {
      setDocsError(String(e?.message ?? 'Upload mislukt'))
    } finally {
      setUploading(false)
    }
  }

  const deleteDoc = async (doc: EmployeeDocument) => {
    const confirmed = window.confirm(`Bestand verwijderen: ${doc.filename}?`)
    if (!confirmed) return

    setDeletingDocId(doc.id)
    setDocsError(null)
    try {
      const rm = await supabase.storage.from('employee-documents').remove([doc.object_path])
      if (rm.error) throw rm.error

      const del = await supabase
        .from('employee_documents')
        .delete()
        .eq('id', doc.id)
      if (del.error) throw del.error

      if (docsForUser?.id) await loadDocs(docsForUser.id)
    } catch (e: any) {
      setDocsError(String(e?.message ?? 'Verwijderen mislukt'))
    } finally {
      setDeletingDocId(null)
    }
  }

  const fetchUsers = async () => {
    setLoading(true)

    let data: any[] | null = null
    let error: any = null

    const res = await supabase
      .from('profiles')
      .select('id, name, email, role, hourly_rate, home_address, break_enabled, default_break_minutes')
      .is('deleted_at', null)
      .order('name')

    data = res.data as any[] | null
    error = res.error

    // Fallback for older schemas where break columns don't exist yet
    if (error) {
      const res2 = await supabase
        .from('profiles')
        .select('id, name, email, role, hourly_rate, home_address')
        .is('deleted_at', null)
        .order('name')
      data = res2.data as any[] | null
      error = res2.error
    }

    if (!error && data) setUsers(data as Profile[])

    setLoading(false)
  }

  const fetchClients = async () => {
    const { data, error } = await supabase.from('clients').select('id, name').order('name')
    if (error) {
      console.warn('clients load failed', error)
      setClients([])
      return
    }
    const mapped = (data ?? []).map((r: any) => ({ id: String(r.id), name: String(r.name) }))
    setClients(mapped.filter((c) => c.id && c.name))
  }

  const fetchEmployeeClients = async () => {
    const { data, error } = await supabase
      .from('employee_clients')
      .select('employee_id, client_id')

    if (error) {
      // Table might not exist yet, or RLS might block.
      console.warn('employee_clients load failed', error)
      setEmployeeClientIds({})
      return
    }

    const next: Record<string, string[]> = {}
    for (const row of (data ?? []) as any[]) {
      const employeeId = String(row.employee_id ?? '')
      const clientId = String(row.client_id ?? '')
      if (!employeeId || !clientId) continue
      if (!next[employeeId]) next[employeeId] = []
      next[employeeId].push(clientId)
    }
    setEmployeeClientIds(next)
  }

  useEffect(() => {
    fetchUsers()
    fetchClients()
    fetchEmployeeClients()
  }, [])

  const setClientAssigned = async (employeeId: string, clientId: string, assigned: boolean) => {
    setSaving(employeeId)

    // Optimistic local update
    setEmployeeClientIds((prev) => {
      const current = new Set(prev[employeeId] ?? [])
      if (assigned) current.add(clientId)
      else current.delete(clientId)
      return { ...prev, [employeeId]: Array.from(current) }
    })

    try {
      if (assigned) {
        const { error } = await supabase
          .from('employee_clients')
          .upsert({ employee_id: employeeId, client_id: clientId }, { onConflict: 'employee_id,client_id' })
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('employee_clients')
          .delete()
          .eq('employee_id', employeeId)
          .eq('client_id', clientId)
        if (error) throw error
      }

      await fetchEmployeeClients()
    } catch (err: any) {
      alert(err?.message ?? 'Opslaan opdrachtgevers mislukt')
      await fetchEmployeeClients()
    } finally {
      setSaving(null)
    }
  }

  const inviteUser = async () => {
    setCreateMessage(null)

    const email = createEmail.trim().toLowerCase()
    if (!email) {
      setCreateMessage('Vul een e-mailadres in.')
      return
    }

    const hourlyRateNum = createHourlyRate.trim() ? Number(createHourlyRate.trim()) : null
    if (createHourlyRate.trim() && Number.isNaN(hourlyRateNum)) {
      setCreateMessage('Uurtarief moet een getal zijn.')
      return
    }

    try {
      setCreateBusy(true)
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const accessToken = session?.access_token
      if (!accessToken) {
        setCreateMessage('Niet ingelogd.')
        return
      }

      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          email,
          name: createName.trim() || null,
          role: createRole,
          hourly_rate: hourlyRateNum,
          home_address: createHomeAddress.trim() || null,
        }),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setCreateMessage(json?.details ? String(json.details) : 'Toevoegen mislukt.')
        return
      }

      setCreateMessage('Uitnodiging verstuurd.')
      setCreateEmail('')
      setCreateName('')
      setCreateRole('employee')
      setCreateHourlyRate('')
      setCreateHomeAddress('')
      await fetchUsers()
    } catch (err: any) {
      setCreateMessage(err?.message ?? 'Toevoegen mislukt.')
    } finally {
      setCreateBusy(false)
    }
  }

  const deleteUser = async (userId: string, label: string) => {
    const confirmed = window.confirm(`Weet je zeker dat je ${label} wilt verwijderen?`)
    if (!confirmed) return

    try {
      setDeletingId(userId)
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const accessToken = session?.access_token
      if (!accessToken) {
        alert('Niet ingelogd.')
        return
      }

      const res = await fetch(`/api/admin/users?id=${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(json?.details ? String(json.details) : 'Verwijderen mislukt.')
        return
      }

      await fetchUsers()
    } catch (err: any) {
      alert(err?.message ?? 'Verwijderen mislukt.')
    } finally {
      setDeletingId(null)
    }
  }

  const updateRole = async (userId: string, role: 'admin' | 'employee' | 'sub-contractor') => {
    setSaving(userId)

    const { error } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', userId)

    if (error) {
      alert('Rol wijzigen mislukt')
      console.error(error)
    }

    await fetchUsers()
    setSaving(null)
  }

  const updateHourlyRate = async (userId: string, hourly_rate: number | null) => {
    setSaving(userId)

    const { error } = await supabase
      .from('profiles')
      .update({ hourly_rate })
      .eq('id', userId)

    if (error) {
      alert('Uurtarief wijzigen mislukt')
      console.error(error)
    }

    await fetchUsers()
    setSaving(null)
  }

  const updateHomeAddress = async (userId: string, home_address: string | null) => {
    setSaving(userId)

    const { error } = await supabase
      .from('profiles')
      .update({ home_address })
      .eq('id', userId)

    if (error) {
      alert('Adres wijzigen mislukt')
      console.error(error)
    }

    await fetchUsers()
    setSaving(null)
  }

  const updateBreakEnabled = async (userId: string, break_enabled: boolean) => {
    setSaving(userId)

    const patch: any = { break_enabled }
    if (!break_enabled) patch.default_break_minutes = 0

    const { error } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', userId)

    if (error) {
      alert('Pauze instelling wijzigen mislukt')
      console.error(error)
    }

    await fetchUsers()
    setSaving(null)
  }

  const updateDefaultBreakMinutes = async (userId: string, minutes: number) => {
    setSaving(userId)

    const safe = Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0
    const { error } = await supabase
      .from('profiles')
      .update({ default_break_minutes: safe })
      .eq('id', userId)

    if (error) {
      alert('Standaard pauze wijzigen mislukt')
      console.error(error)
    }

    await fetchUsers()
    setSaving(null)
  }

  if (loading) return <p>Gebruikers laden…</p>

  const clientsById = new Map(clients.map((c) => [c.id, c.name]))

  return (
    <div className="p-4 border border-orange-200/60 dark:border-orange-500/30 rounded mt-6 bg-white dark:bg-black/30 text-gray-900 dark:text-gray-100">
      <h2 className="text-xl font-bold mb-4">Werknemers</h2>

      <div className="border border-orange-200/60 dark:border-orange-500/30 rounded p-3 mb-4 bg-white dark:bg-transparent">
        <h3 className="font-semibold mb-2 text-gray-900 dark:text-gray-100">Werknemer toevoegen</h3>

        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-sm opacity-80">
            Tip: heb je een inschrijfformulier (PDF)? Importeren kan ook.
          </div>
          <button
            onClick={openIntake}
            className="text-sm px-3 py-2 rounded border border-orange-200/60 dark:border-orange-500/30 hover:bg-orange-50 dark:hover:bg-white/5"
          >
            📄 Inschrijf formulier uploaden
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm mb-1 text-gray-700 dark:text-gray-200">E-mail</label>
            <input
              value={createEmail}
              onChange={(e) => setCreateEmail(e.target.value)}
              className="w-full bg-transparent border rounded px-2 py-1 text-gray-900 dark:text-gray-100"
              placeholder="naam@bedrijf.nl"
            />
          </div>

          <div>
            <label className="block text-sm mb-1 text-gray-700 dark:text-gray-200">Naam</label>
            <input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              className="w-full bg-transparent border rounded px-2 py-1 text-gray-900 dark:text-gray-100"
              placeholder="Voornaam Achternaam"
            />
          </div>

          <div>
            <label className="block text-sm mb-1 text-gray-700 dark:text-gray-200">Rol</label>
            <select
              value={createRole}
              onChange={(e) => setCreateRole(e.target.value as 'admin' | 'employee' | 'sub-contractor')}
              className="w-full border rounded px-2 py-1 bg-white text-gray-900 border-gray-300 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700"
            >
              <option value="employee">Werknemer</option>
              <option value="sub-contractor">Sub-Contractor</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div>
            <label className="block text-sm mb-1 text-gray-700 dark:text-gray-200">Uurtarief (optioneel)</label>
            <input
              value={createHourlyRate}
              onChange={(e) => setCreateHourlyRate(e.target.value)}
              className="w-full bg-transparent border rounded px-2 py-1 text-gray-900 dark:text-gray-100"
              placeholder="bijv. 25"
              inputMode="decimal"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm mb-1 text-gray-700 dark:text-gray-200">Thuisadres (optioneel)</label>
            <input
              value={createHomeAddress}
              onChange={(e) => setCreateHomeAddress(e.target.value)}
              className="w-full bg-transparent border rounded px-2 py-1 text-gray-900 dark:text-gray-100"
              placeholder="Straat 1, 1234 AB Plaats"
            />
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={inviteUser}
            disabled={createBusy}
            className="bg-orange-600 text-white px-3 py-2 rounded hover:bg-orange-700 disabled:opacity-50"
          >
            {createBusy ? 'Bezig…' : 'Uitnodigen'}
          </button>
          {createMessage && <div className="text-sm text-gray-700 dark:text-gray-200">{createMessage}</div>}
        </div>
      </div>

      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[1100px] text-sm border-collapse border border-orange-200/60 dark:border-orange-500/30 bg-white dark:bg-transparent">
        <thead>
          <tr className="bg-orange-100 dark:bg-orange-500/10">
            <th className="border p-2 font-semibold text-gray-900 dark:text-gray-100 bg-orange-100 dark:bg-orange-500/10">Naam</th>
            <th className="border p-2 font-semibold text-gray-900 dark:text-gray-100 bg-orange-100 dark:bg-orange-500/10">E-mail</th>
            <th className="border p-2 font-semibold text-gray-900 dark:text-gray-100 bg-orange-100 dark:bg-orange-500/10">Opdrachtgevers</th>
            <th className="border p-2 font-semibold text-gray-900 dark:text-gray-100 bg-orange-100 dark:bg-orange-500/10">Uurtarief</th>
            <th className="border p-2 font-semibold text-gray-900 dark:text-gray-100 bg-orange-100 dark:bg-orange-500/10">Thuisadres</th>
            <th className="border p-2 font-semibold text-gray-900 dark:text-gray-100 bg-orange-100 dark:bg-orange-500/10">Pauze</th>
            <th className="border p-2 font-semibold text-gray-900 dark:text-gray-100 bg-orange-100 dark:bg-orange-500/10">Standaard pauze (uur)</th>
            <th className="border p-2 font-semibold text-gray-900 dark:text-gray-100 bg-orange-100 dark:bg-orange-500/10">Rol</th>
            <th className="border p-2 font-semibold text-gray-900 dark:text-gray-100 bg-orange-100 dark:bg-orange-500/10">Documenten</th>
            <th className="border p-2 font-semibold text-gray-900 dark:text-gray-100 bg-orange-100 dark:bg-orange-500/10">Acties</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="odd:bg-white even:bg-orange-50/30 dark:odd:bg-transparent dark:even:bg-black/10">
              <td className="border p-2 text-gray-900 dark:text-gray-100">
               <input
                  value={u.name ?? ''}
                  onChange={(e) =>
                    setUsers((prev) =>
                      prev.map((p) =>
                        p.id === u.id ? { ...p, name: e.target.value } : p
                     )
                    )
                  }
                  onBlur={async () => {
                    await supabase
                      .from('profiles')
                      .update({ name: u.name })
                      .eq('id', u.id)
                  }}
                  className="w-full bg-transparent border-b border-gray-400 text-gray-900 dark:text-gray-100"
                  placeholder="Naam invoeren"
                />
            </td>

              <td className="border p-2 text-gray-900 dark:text-gray-100">{u.email ?? '—'}</td>

              <td className="border p-2 text-gray-900 dark:text-gray-100">
                <details>
                  <summary className="cursor-pointer select-none">
                    {(() => {
                      const assignedIds = employeeClientIds[u.id] ?? []
                      const assignedNames = assignedIds
                        .map((id) => clientsById.get(id))
                        .filter(Boolean) as string[]
                      if (assignedNames.length === 0) return 'Alles (geen selectie)'
                      return `${assignedNames.length} geselecteerd`
                    })()}
                  </summary>

                  <div className="mt-2 max-h-48 overflow-auto rounded border border-orange-200/60 dark:border-orange-500/30 p-2 bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">
                    {clients.length === 0 ? (
                      <div className="text-sm opacity-70">Geen opdrachtgevers gevonden.</div>
                    ) : (
                      clients.map((c) => {
                        const assignedSet = new Set(employeeClientIds[u.id] ?? [])
                        const checked = assignedSet.has(c.id)
                        return (
                          <label key={c.id} className="flex items-center gap-2 py-1">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={saving === u.id}
                              onChange={(e) => setClientAssigned(u.id, c.id, e.target.checked)}
                            />
                            <span>{c.name}</span>
                          </label>
                        )
                      })
                    )}
                    <div className="mt-2 text-xs opacity-70">
                      Tip: als je niets aanvinkt, ziet de werknemer alle opdrachtgevers.
                    </div>
                  </div>
                </details>
              </td>

              <td className="border p-2 text-gray-900 dark:text-gray-100">
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={u.hourly_rate ?? ''}
                  disabled={saving === u.id}
                  onChange={(e) => {
                    const v = e.target.value
                    setUsers((prev) =>
                      prev.map((p) =>
                        p.id === u.id
                          ? { ...p, hourly_rate: v === '' ? null : Number(v) }
                          : p
                      )
                    )
                  }}
                  onBlur={async () => {
                    const current = users.find((x) => x.id === u.id)?.hourly_rate ?? null
                    await updateHourlyRate(u.id, current)
                  }}
                  className="w-24 bg-transparent border-b border-gray-400 text-gray-900 dark:text-gray-100"
                  placeholder="€ / uur"
                />
              </td>

              <td className="border p-2 text-gray-900 dark:text-gray-100">
                <input
                  value={u.home_address ?? ''}
                  disabled={saving === u.id}
                  onChange={(e) =>
                    setUsers((prev) =>
                      prev.map((p) =>
                        p.id === u.id ? { ...p, home_address: e.target.value } : p
                      )
                    )
                  }
                  onBlur={async () => {
                    const current = users.find((x) => x.id === u.id)?.home_address ?? null
                    await updateHomeAddress(u.id, current && String(current).trim() ? String(current).trim() : null)
                  }}
                  className="w-full bg-transparent border-b border-gray-400 text-gray-900 dark:text-gray-100"
                  placeholder="Bijv. Dorpsstraat 1, 1234 AB Plaats"
                />
              </td>

              <td className="border p-2 text-gray-900 dark:text-gray-100">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(u.break_enabled)}
                    disabled={saving === u.id}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setUsers((prev) =>
                        prev.map((p) =>
                          p.id === u.id
                            ? {
                                ...p,
                                break_enabled: checked,
                                default_break_minutes: checked ? (p.default_break_minutes ?? 0) : 0,
                              }
                            : p
                        )
                      )
                    }}
                    onBlur={async () => {
                      const current = Boolean(users.find((x) => x.id === u.id)?.break_enabled)
                      await updateBreakEnabled(u.id, current)
                    }}
                  />
                  <span>Registreren</span>
                </label>
              </td>

              <td className="border p-2 text-gray-900 dark:text-gray-100">
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.25"
                  min="0"
                  value={(() => {
                    const enabled = Boolean(u.break_enabled)
                    const minutes = enabled ? Number(u.default_break_minutes ?? 0) : 0
                    const hours = minutes / 60
                    return minutes === 0 ? '0' : String(hours)
                  })()}
                  disabled={saving === u.id || !Boolean(u.break_enabled)}
                  onChange={(e) => {
                    const raw = e.target.value
                    const hours = raw === '' ? 0 : Number(raw)
                    const minutes = Number.isFinite(hours) ? Math.max(0, Math.round(hours * 60)) : 0
                    setUsers((prev) =>
                      prev.map((p) =>
                        p.id === u.id
                          ? { ...p, default_break_minutes: minutes }
                          : p
                      )
                    )
                  }}
                  onBlur={async () => {
                    const enabled = Boolean(users.find((x) => x.id === u.id)?.break_enabled)
                    const minutes = enabled ? Number(users.find((x) => x.id === u.id)?.default_break_minutes ?? 0) : 0
                    await updateDefaultBreakMinutes(u.id, minutes)
                  }}
                  className="w-24 bg-transparent border-b border-gray-400 text-gray-900 dark:text-gray-100"
                />
              </td>

              <td className="border p-2 text-gray-900 dark:text-gray-100">
                <select
                  value={u.role}
                  disabled={saving === u.id}
                  onChange={(e) =>
                    updateRole(
                      u.id,
                      e.target.value as 'admin' | 'employee' | 'sub-contractor'
                    )
                  }
                  className="border rounded px-2 py-1 bg-white text-gray-900 border-gray-300 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700"
                >
                  <option value="employee">Werknemer</option>
                  <option value="sub-contractor">Sub-Contractor</option>
                  <option value="admin">Admin</option>
                </select>
              </td>

              <td className="border p-2 text-gray-900 dark:text-gray-100">
                <button
                  onClick={() => openDocs(u)}
                  className="text-orange-700 hover:text-orange-900 dark:text-orange-300 dark:hover:text-orange-200"
                >
                  Documenten
                </button>
              </td>

              <td className="border p-2 text-right">
                <button
                  onClick={() => deleteUser(u.id, u.name ?? u.email ?? 'deze gebruiker')}
                  disabled={deletingId === u.id}
                  className="text-red-600 hover:text-red-800 disabled:opacity-50"
                >
                  {deletingId === u.id ? 'Bezig…' : 'Verwijderen'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>

      {docsForUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={closeDocs}
          />

          <div className="relative w-full max-w-2xl rounded border border-orange-200/60 dark:border-orange-500/30 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-xl">
            <div className="flex items-start justify-between gap-4 p-4 border-b border-orange-200/60 dark:border-orange-500/30">
              <div>
                <div className="text-lg font-bold">Documenten</div>
                <div className="text-sm opacity-80">{docsForUser.name ?? docsForUser.email ?? docsForUser.id}</div>
              </div>
              <button
                onClick={closeDocs}
                className="px-2 py-1 rounded border border-orange-200/60 dark:border-orange-500/30 hover:bg-orange-50 dark:hover:bg-white/5"
              >
                Sluiten
              </button>
            </div>

            <div className="p-4">
              <div className="rounded border border-orange-200/60 dark:border-orange-500/30 p-3 bg-orange-50/30 dark:bg-transparent">
                <div className="font-semibold mb-2">Upload</div>
                <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                  <input
                    type="file"
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null
                      setUploadFile(f)
                    }}
                    className="block w-full text-sm"
                  />
                  <button
                    onClick={uploadDoc}
                    disabled={uploading || !uploadFile}
                    className="bg-orange-600 text-white px-3 py-2 rounded hover:bg-orange-700 disabled:opacity-50"
                  >
                    {uploading ? 'Uploaden…' : 'Upload'}
                  </button>
                </div>
                <div className="mt-2 text-xs opacity-70">
                  Let op: er zit een 50MB limiet op bestanden. Zorg dat je een goede bestandsnaam kiest, deze wordt niet automatisch aangepast.
                </div>
              </div>

              {docsError && (
                <div className="mt-3 text-sm text-red-700 dark:text-red-300">{docsError}</div>
              )}

              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">Bestanden</div>
                  <button
                    onClick={() => loadDocs(docsForUser.id)}
                    disabled={docsLoading}
                    className="text-sm text-orange-700 hover:text-orange-900 dark:text-orange-300 dark:hover:text-orange-200 disabled:opacity-50"
                  >
                    {docsLoading ? 'Laden…' : 'Verversen'}
                  </button>
                </div>

                <div className="mt-2 rounded border border-orange-200/60 dark:border-orange-500/30 overflow-hidden">
                  {docsLoading ? (
                    <div className="p-3 text-sm opacity-70">Documenten laden…</div>
                  ) : docs.length === 0 ? (
                    <div className="p-3 text-sm opacity-70">Nog geen documenten.</div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-orange-100 dark:bg-orange-500/10">
                        <tr>
                          <th className="text-left p-2">Bestand</th>
                          <th className="text-left p-2">Datum</th>
                          <th className="text-right p-2">Acties</th>
                        </tr>
                      </thead>
                      <tbody>
                        {docs.map((d) => (
                          <tr key={d.id} className="odd:bg-white even:bg-orange-50/30 dark:odd:bg-transparent dark:even:bg-black/10">
                            <td className="p-2 break-all">{d.filename}</td>
                            <td className="p-2 whitespace-nowrap">{new Date(d.created_at).toLocaleString()}</td>
                            <td className="p-2 text-right whitespace-nowrap">
                              <button
                                onClick={() => downloadDoc(d)}
                                className="text-orange-700 hover:text-orange-900 dark:text-orange-300 dark:hover:text-orange-200 mr-3"
                              >
                                Download
                              </button>
                              <button
                                onClick={() => deleteDoc(d)}
                                disabled={deletingDocId === d.id}
                                className="text-red-600 hover:text-red-800 disabled:opacity-50"
                              >
                                {deletingDocId === d.id ? 'Bezig…' : 'Verwijder'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {intakeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={closeIntake}
          />

          <div className="relative w-full max-w-2xl rounded border border-orange-200/60 dark:border-orange-500/30 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-xl">
            <div className="flex items-start justify-between gap-4 p-4 border-b border-orange-200/60 dark:border-orange-500/30">
              <div>
                <div className="text-lg font-bold">Inschrijf formulier importeren</div>
                <div className="text-sm opacity-80">Upload het PDF-formulier en controleer de velden.</div>
              </div>
              <button
                onClick={closeIntake}
                className="px-2 py-1 rounded border border-orange-200/60 dark:border-orange-500/30 hover:bg-orange-50 dark:hover:bg-white/5"
              >
                Sluiten
              </button>
            </div>

            <div className="p-4">
              <div className="rounded border border-orange-200/60 dark:border-orange-500/30 p-3 bg-orange-50/30 dark:bg-transparent">
                <div className="font-semibold mb-2">PDF upload</div>
                <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                  <input
                    type="file"
                    accept="application/pdf"
                    disabled={intakeBusy || intakeCreateBusy}
                    onChange={async (e) => {
                      const f = e.target.files?.[0] ?? null
                      setIntakeFile(f)
                      setIntakeExtracted(null)
                      if (f) await parseIntake(f)
                    }}
                    className="block w-full text-sm"
                  />
                  <button
                    onClick={async () => {
                      if (intakeFile) await parseIntake(intakeFile)
                    }}
                    disabled={intakeBusy || !intakeFile}
                    className="text-sm px-3 py-2 rounded border border-orange-200/60 dark:border-orange-500/30 hover:bg-orange-50 dark:hover:bg-white/5 disabled:opacity-50"
                  >
                    {intakeBusy ? 'Inlezen…' : 'Opnieuw inlezen'}
                  </button>
                </div>
                <div className="mt-2 text-xs opacity-70">
                  Werkt het niet? Dan is de PDF waarschijnlijk een scan (geen selecteerbare tekst). Dan is OCR nodig.
                </div>
              </div>

              {intakeExtracted && (
                <div className="mt-3 text-xs opacity-80">
                  Extractie: {intakeExtracted.confidence}{' '}
                  {intakeExtracted.warnings?.length ? `(${intakeExtracted.warnings.join(', ')})` : ''}
                </div>
              )}

              {intakeMessage && (
                <div className="mt-3 text-sm text-gray-900 dark:text-gray-100">{intakeMessage}</div>
              )}

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm mb-1 opacity-80">E-mail</label>
                  <input
                    value={intakeEmail}
                    onChange={(e) => setIntakeEmail(e.target.value)}
                    className="w-full bg-transparent border rounded px-2 py-1"
                    placeholder="naam@bedrijf.nl"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1 opacity-80">Naam</label>
                  <input
                    value={intakeName}
                    onChange={(e) => setIntakeName(e.target.value)}
                    className="w-full bg-transparent border rounded px-2 py-1"
                    placeholder="Voornaam Achternaam"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm mb-1 opacity-80">Adres</label>
                  <input
                    value={intakeAddress}
                    onChange={(e) => setIntakeAddress(e.target.value)}
                    className="w-full bg-transparent border rounded px-2 py-1"
                    placeholder="Straat 1, 1234 AB Plaats"
                  />
                </div>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={createFromIntake}
                  disabled={intakeCreateBusy || intakeBusy || !intakeFile}
                  className="bg-orange-600 text-white px-3 py-2 rounded hover:bg-orange-700 disabled:opacity-50"
                >
                  {intakeCreateBusy ? 'Aanmaken…' : 'Werknemer aanmaken'}
                </button>
                <div className="text-xs opacity-70">
                  Dit maakt een nieuwe gebruiker aan en slaat de PDF op in documenten.
                </div>
              </div>

              <div className="mt-3 text-xs opacity-70">
                Voor dit onderdeel moeten ook de document-tabellen/bucket actief zijn (documents.sql).
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
