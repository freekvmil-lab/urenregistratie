'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    // If the user comes here without a recovery/invite session,
    // they can still request a reset email from /login.
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        setMessage('Vraag een reset-link aan via de login pagina.')
      }
    })
  }, [])

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)

    if (password.length < 8) {
      setError('Wachtwoord moet minimaal 8 tekens zijn.')
      return
    }

    if (password !== password2) {
      setError('Wachtwoorden komen niet overeen.')
      return
    }

    try {
      setBusy(true)

      const { data } = await supabase.auth.getSession()
      if (!data.session) {
        setError('Geen geldige reset sessie. Vraag opnieuw een reset-link aan.')
        return
      }

      const { error } = await supabase.auth.updateUser({ password })
      if (error) {
        setError(error.message)
        return
      }

      setMessage('Wachtwoord ingesteld. Je wordt doorgestuurd…')
      setTimeout(() => router.push('/'), 800)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center">
      <form
        onSubmit={handleSetPassword}
        className="w-full max-w-sm space-y-4 rounded-xl border p-6 shadow"
      >
        <h1 className="text-xl font-bold">Wachtwoord instellen</h1>

        <input
          type="password"
          placeholder="Nieuw wachtwoord (min. 8 tekens)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border p-2"
          required
        />

        <input
          type="password"
          placeholder="Herhaal nieuw wachtwoord"
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
          className="w-full rounded border p-2"
          required
        />

        {error && <p className="text-sm text-red-600">{error}</p>}
        {message && <p className="text-sm text-orange-700">{message}</p>}

        <button disabled={busy} className="w-full rounded bg-black p-2 text-white disabled:opacity-50">
          {busy ? 'Bezig…' : 'Opslaan'}
        </button>
      </form>
    </main>
  )
}
