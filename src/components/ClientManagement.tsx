"use client"

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Client {
  id: number
  name: string
  note?: string | null
}

export default function ClientManagement() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [editingNote, setEditingNote] = useState('')

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('clients').select('*').order('name')
    setClients((data ?? []) as Client[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const addClient = async () => {
    if (!name.trim()) return
    setLoading(true)
    await supabase.from('clients').insert({ name: name.trim(), note: note || null })
    setName('')
    setNote('')
    await load()
  }

  const startEdit = (c: Client) => {
    setEditingId(c.id)
    setEditingName(c.name)
    setEditingNote(c.note ?? '')
  }

  const saveEdit = async () => {
    if (!editingId) return
    setLoading(true)
    await supabase.from('clients').update({ name: editingName.trim(), note: editingNote || null }).eq('id', editingId)
    setEditingId(null)
    setEditingName('')
    setEditingNote('')
    await load()
  }

  const remove = async (id: number) => {
    if (!confirm('Weet je zeker dat je deze opdrachtgever wilt verwijderen?')) return
    setLoading(true)
    await supabase.from('clients').delete().eq('id', id)
    await load()
  }

  return (
    <div className="p-4 border rounded bg-white/5">
      <h3 className="text-lg font-semibold mb-3">Opdrachtgevers beheer</h3>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Naam" className="col-span-2 p-2 rounded bg-gray-800 border border-gray-700" />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notitie (optioneel)" className="p-2 rounded bg-gray-800 border border-gray-700" />
        <div className="col-span-3 flex justify-end gap-2">
          <button onClick={addClient} className="px-3 py-1 bg-green-600 text-white rounded">Toevoegen</button>
        </div>
      </div>

      <div>
        {loading ? (
          <p>Laden…</p>
        ) : clients.length === 0 ? (
          <p>Geen opdrachtgevers</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left text-sm text-gray-400">
                <th className="p-2">Naam</th>
                <th className="p-2">Notitie</th>
                <th className="p-2">Acties</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="border-t border-gray-700">
                  <td className="p-2">
                    {editingId === c.id ? (
                      <input value={editingName} onChange={(e) => setEditingName(e.target.value)} className="p-1 rounded bg-gray-800 border border-gray-700 w-full" />
                    ) : (
                      c.name
                    )}
                  </td>
                  <td className="p-2">
                    {editingId === c.id ? (
                      <input value={editingNote} onChange={(e) => setEditingNote(e.target.value)} className="p-1 rounded bg-gray-800 border border-gray-700 w-full" />
                    ) : (
                      c.note ?? '-'
                    )}
                  </td>
                  <td className="p-2">
                    {editingId === c.id ? (
                      <div className="flex gap-2">
                        <button onClick={saveEdit} className="px-2 py-1 bg-black text-white rounded">Opslaan</button>
                        <button onClick={() => setEditingId(null)} className="px-2 py-1 border rounded">Annuleren</button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={() => startEdit(c)} className="px-2 py-1 border rounded">Bewerk</button>
                        <button onClick={() => remove(c.id)} className="px-2 py-1 bg-red-600 text-white rounded">Verwijder</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
