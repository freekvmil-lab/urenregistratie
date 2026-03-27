'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Profile {
  id: string
  name: string | null
  email: string | null
  role: 'admin' | 'employee' | 'sub-contractor'
}

interface Assignment {
  id: number
  sub_contractor_id: string
  employee_id: string
  assigned_at: string
}

export default function SubContractorAssignments() {
  const [subContractors, setSubContractors] = useState<Profile[]>([])
  const [employees, setEmployees] = useState<Profile[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  // Form state
  const [selectedSubContractor, setSelectedSubContractor] = useState('')
  const [selectedEmployee, setSelectedEmployee] = useState('')
  const [addingAssignment, setAddingAssignment] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const fetchData = async () => {
    setLoading(true)

    // Fetch all sub-contractors
    const { data: scs } = await supabase
      .from('profiles')
      .select('id, name, email, role')
      .eq('role', 'sub-contractor')
      .is('deleted_at', null)
      .order('name')

    setSubContractors((scs ?? []) as Profile[])

    // Fetch all employees and sub-contractors (those who can have assignments)
    const { data: emps } = await supabase
      .from('profiles')
      .select('id, name, email, role')
      .in('role', ['employee', 'sub-contractor'])
      .is('deleted_at', null)
      .order('name')

    setEmployees((emps ?? []) as Profile[])

    // Fetch assignments
    const { data: assigns } = await supabase
      .from('sub_contractor_assignments')
      .select('id, sub_contractor_id, employee_id, assigned_at')
      .order('assigned_at', { ascending: false })

    setAssignments((assigns ?? []) as Assignment[])
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  const addAssignment = async () => {
    setMessage(null)

    if (!selectedSubContractor || !selectedEmployee) {
      setMessage('Selecteer zowel een Sub-Contractor als een Medewerker.')
      return
    }

    if (selectedSubContractor === selectedEmployee) {
      setMessage('Een Sub-Contractor kan zichzelf niet toewijzen.')
      return
    }

    setAddingAssignment(true)

    try {
      const { error } = await supabase
        .from('sub_contractor_assignments')
        .insert({
          sub_contractor_id: selectedSubContractor,
          employee_id: selectedEmployee,
        })

      if (error) {
        if (error.message.includes('unique')) {
          setMessage('Deze Sub-Contractor is al toegewezen aan deze Medewerker.')
        } else if (error.message.includes('check')) {
          setMessage('De geselecteerde Sub-Contractor is niet geldig.')
        } else {
          setMessage(error.message)
        }
        return
      }

      setMessage('Toewijzing toegevoegd.')
      setSelectedSubContractor('')
      setSelectedEmployee('')
      await fetchData()
    } catch (err: any) {
      setMessage(err?.message ?? 'Toevoegen mislukt.')
    } finally {
      setAddingAssignment(false)
    }
  }

  const removeAssignment = async (assignmentId: number) => {
    const confirmed = window.confirm('Weet je zeker dat je deze toewijzing wilt verwijderen?')
    if (!confirmed) return

    setSaving(String(assignmentId))

    try {
      const { error } = await supabase
        .from('sub_contractor_assignments')
        .delete()
        .eq('id', assignmentId)

      if (error) throw error

      await fetchData()
    } catch (err: any) {
      alert(err?.message ?? 'Verwijderen mislukt.')
    } finally {
      setSaving(null)
    }
  }

  if (loading) return <p>Laden…</p>

  // Build lookup maps
  const subContractorMap = new Map(subContractors.map((sc) => [sc.id, sc]))
  const employeeMap = new Map(employees.map((e) => [e.id, e]))

  return (
    <div className="p-4 border border-orange-200/60 dark:border-orange-500/30 rounded bg-white dark:bg-black/30 text-gray-900 dark:text-gray-100">
      <h2 className="text-xl font-bold mb-4">Sub-Contractor Toewijzingen</h2>

      {/* Add Assignment Form */}
      <div className="border border-orange-200/60 dark:border-orange-500/30 rounded p-3 mb-4 bg-orange-50/30 dark:bg-transparent">
        <h3 className="font-semibold mb-3">Nieuwe Toewijzing</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm mb-1 text-gray-700 dark:text-gray-200">Sub-Contractor</label>
            <select
              value={selectedSubContractor}
              onChange={(e) => setSelectedSubContractor(e.target.value)}
              disabled={addingAssignment}
              className="w-full border rounded px-2 py-1 bg-white text-gray-900 border-gray-300 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700"
            >
              <option value="">-- Selecteer --</option>
              {subContractors.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {sc.name || sc.email || sc.id}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm mb-1 text-gray-700 dark:text-gray-200">Medewerker</label>
            <select
              value={selectedEmployee}
              onChange={(e) => setSelectedEmployee(e.target.value)}
              disabled={addingAssignment}
              className="w-full border rounded px-2 py-1 bg-white text-gray-900 border-gray-300 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700"
            >
              <option value="">-- Selecteer --</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name || e.email || e.id}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={addAssignment}
              disabled={addingAssignment || !selectedSubContractor || !selectedEmployee}
              className="w-full px-4 py-1 rounded bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50"
            >
              {addingAssignment ? 'Toevoegen…' : 'Toevoegen'}
            </button>
          </div>
        </div>

        {message && (
          <div
            className={`mt-3 p-2 rounded text-sm ${
              message.includes('toegevoegd') || message.includes('Toewijzing')
                ? 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300'
                : 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300'
            }`}
          >
            {message}
          </div>
        )}
      </div>

      {/* Assignments List */}
      <div>
        <h3 className="font-semibold mb-3">Huidige Toewijzingen</h3>

        {assignments.length === 0 ? (
          <p className="text-sm opacity-70">Geen toewijzingen gevonden.</p>
        ) : (
          <div className="overflow-x-auto border border-orange-200/60 dark:border-orange-500/30 rounded">
            <table className="w-full text-sm">
              <thead className="bg-orange-100 dark:bg-orange-500/10">
                <tr>
                  <th className="text-left p-2">Sub-Contractor</th>
                  <th className="text-left p-2">Medewerker</th>
                  <th className="text-left p-2">Datum Toegewezen</th>
                  <th className="text-right p-2">Acties</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => {
                  const sc = subContractorMap.get(a.sub_contractor_id)
                  const emp = employeeMap.get(a.employee_id)

                  return (
                    <tr key={a.id} className="odd:bg-white even:bg-orange-50/30 dark:odd:bg-transparent dark:even:bg-black/10">
                      <td className="p-2">{sc?.name || sc?.email || a.sub_contractor_id}</td>
                      <td className="p-2">{emp?.name || emp?.email || a.employee_id}</td>
                      <td className="p-2 text-xs opacity-70">
                        {new Date(a.assigned_at).toLocaleDateString()}
                      </td>
                      <td className="p-2 text-right">
                        <button
                          onClick={() => removeAssignment(a.id)}
                          disabled={saving === String(a.id)}
                          className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50"
                        >
                          {saving === String(a.id) ? 'Bezig…' : 'Verwijderen'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
