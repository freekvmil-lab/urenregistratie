'use client'

import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [mode, setMode] = useState<'password' | 'magic'>('password')
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setBusy(true)

    const emailValue = email.trim().toLowerCase()
    if (!emailValue) {
      setError('Vul je e-mailadres in.')
      setBusy(false)
      return
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: emailValue,
      password,
    })

    if (error) {
      setError(error.message)
    } else {
      router.push('/')
    }

    setBusy(false)
  }

  const sendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setBusy(true)

    const emailValue = email.trim().toLowerCase()
    if (!emailValue) {
      setError('Vul je e-mailadres in.')
      setBusy(false)
      return
    }

    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : undefined
      const { error } = await supabase.auth.signInWithOtp({
        email: emailValue,
        options: {
          emailRedirectTo: origin ? `${origin}/` : undefined,
        },
      })

      if (error) {
        setError(error.message)
      } else {
        setMessage('Login-link verstuurd. Check je e-mail.')
      }
    } catch (err: any) {
      setError(err?.message ?? 'Kon geen login-link versturen.')
    } finally {
      setBusy(false)
    }
  }

  const sendResetPassword = async () => {
    setError(null)
    setMessage(null)
    setBusy(true)

    const emailValue = email.trim().toLowerCase()
    if (!emailValue) {
      setError('Vul je e-mailadres in.')
      setBusy(false)
      return
    }

    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : undefined
      const { error } = await supabase.auth.resetPasswordForEmail(emailValue, {
        redirectTo: origin ? `${origin}/reset-password` : undefined,
      })

      if (error) {
        setError(error.message)
      } else {
        // Supabase returns success even if the email doesn't exist (anti-enumeration)
        setMessage('Als dit e-mailadres bestaat, is er een reset-link verstuurd.')
      }
    } catch (err: any) {
      setError(err?.message ?? 'Kon geen reset-link versturen.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center">
      <form
        onSubmit={mode === 'password' ? handleLogin : sendMagicLink}
        className="w-full max-w-sm space-y-4 rounded-xl border p-6 shadow"
      >
        <h1 className="text-xl font-bold">Inloggen</h1>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setMode('password')
              setError(null)
              setMessage(null)
            }}
            className={`flex-1 rounded px-3 py-2 border ${
              mode === 'password' ? 'bg-black text-white border-black' : 'bg-white text-black'
            }`}
          >
            Met wachtwoord
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('magic')
              setError(null)
              setMessage(null)
            }}
            className={`flex-1 rounded px-3 py-2 border ${
              mode === 'magic' ? 'bg-black text-white border-black' : 'bg-white text-black'
            }`}
          >
            Login-link
          </button>
        </div>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded border p-2"
          required
        />

        {mode === 'password' && (
          <input
            type="password"
            placeholder="Wachtwoord"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border p-2"
            required
          />
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        {message && <p className="text-sm text-green-700">{message}</p>}

        <button disabled={busy} className="w-full rounded bg-black p-2 text-white disabled:opacity-50">
          {busy ? 'Bezig…' : mode === 'password' ? 'Login' : 'Stuur login-link'}
        </button>

        {mode === 'password' && (
          <button
            type="button"
            onClick={sendResetPassword}
            disabled={busy || !email.trim()}
            className="w-full text-sm underline disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Wachtwoord vergeten / instellen
          </button>
        )}
      </form>
    </main>
  )
}
