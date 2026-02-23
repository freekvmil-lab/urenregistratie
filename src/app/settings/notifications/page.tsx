'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

export default function NotificationsSettingsPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null)

  const supported = useMemo(() => {
    if (typeof window === 'undefined') return false
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  }, [])

  const loadUser = useCallback(async () => {
    const { data } = await supabase.auth.getUser()
    setUserId(data.user?.id ?? null)
  }, [])

  useEffect(() => {
    loadUser()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => loadUser())
    return () => subscription.unsubscribe()
  }, [loadUser])

  useEffect(() => {
    if (!supported) return

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/push/vapid-public', { cache: 'no-store' })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error || 'VAPID public key ophalen mislukt')
        if (!cancelled) setVapidPublicKey(json?.publicKey || null)
      } catch (e: any) {
        if (!cancelled) {
          setVapidPublicKey(null)
          setStatus(e?.message || 'VAPID public key ophalen mislukt')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [supported])

  const getRegistration = async () => {
    const reg = await navigator.serviceWorker.register('/sw.js')
    return reg
  }

  const upsertSubscription = async (sub: PushSubscription) => {
    const { data } = await supabase.auth.getUser()
    if (!data.user) throw new Error('Niet ingelogd')

    const endpoint = sub.endpoint
    const json = sub.toJSON()

    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: data.user.id,
          endpoint,
          subscription: json,
        },
        { onConflict: 'user_id,endpoint' }
      )

    if (error) {
      // Helpful message when table not created yet
      if (String(error.message || '').toLowerCase().includes('relation') && String(error.message || '').toLowerCase().includes('push_subscriptions')) {
        throw new Error('Tabel push_subscriptions bestaat nog niet. Run eerst push_subscriptions.sql in Supabase.')
      }
      throw new Error(error.message || 'Opslaan mislukt')
    }
  }

  const enable = async () => {
    if (!supported) {
      setStatus('Push is niet ondersteund op dit device/browser.')
      return
    }

    setBusy(true)
    setStatus('')
    try {
      // iOS: permission prompt works only after “Add to Home Screen” (PWA) and user gesture.
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setStatus('Notificaties niet toegestaan.')
        return
      }

      if (!vapidPublicKey) {
        setStatus('VAPID public key ontbreekt op de server. Check je environment (Vercel/.env.local).')
        return
      }

      const reg = await getRegistration()
      const existing = await reg.pushManager.getSubscription()
      const sub =
        existing ||
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        }))

      await upsertSubscription(sub)
      setStatus('Push notificaties staan aan op dit apparaat.')
    } catch (e: any) {
      setStatus(e?.message || 'Inschakelen mislukt')
    } finally {
      setBusy(false)
    }
  }

  const disable = async () => {
    if (!supported) return
    setBusy(true)
    setStatus('')
    try {
      const reg = await getRegistration()
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await sub.unsubscribe()
      }
      setStatus('Push notificaties zijn uitgeschakeld op dit apparaat.')
    } catch (e: any) {
      setStatus(e?.message || 'Uitschakelen mislukt')
    } finally {
      setBusy(false)
    }
  }

  const sendTest = async () => {
    if (!supported) return
    setBusy(true)
    setStatus('')
    try {
      const { data: sessionRes } = await supabase.auth.getSession()
      const token = sessionRes.session?.access_token
      if (!token) {
        setStatus('Je bent niet ingelogd.')
        return
      }

      const reg = await getRegistration()
      const sub = await reg.pushManager.getSubscription()
      if (!sub) {
        setStatus('Nog geen subscription. Klik eerst op “Inschakelen”.')
        return
      }

      const res = await fetch('/api/push/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          subscription: sub,
          title: 'Vortexx',
          body: 'Dit is een test push-notificatie.',
          url: '/',
        }),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        const details = json?.details
        const parts = [json?.error || 'Test push mislukt']
        if (details?.statusCode) parts.push(`statusCode=${details.statusCode}`)
        if (details?.message) parts.push(String(details.message))
        if (details?.body) parts.push(String(details.body))
        throw new Error(parts.join(' — '))
      }

      setStatus('Test push verstuurd. (Kijk ook naar je notificaties/lockscreen)')
    } catch (e: any) {
      setStatus(e?.message || 'Test push mislukt')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="px-4 py-4 sm:p-6 space-y-4 md:max-w-2xl md:mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Notificaties</h1>

      {!userId ? (
        <p className="text-sm text-gray-600 dark:text-gray-300">Log in om push notificaties te activeren.</p>
      ) : null}

      <div className="rounded-lg border border-orange-200/60 dark:border-orange-500/30 bg-white/60 dark:bg-gray-900/40 p-4 space-y-3">
        <p className="text-sm text-gray-700 dark:text-gray-200">
          Push werkt op Android (Chrome) en op iPhone vanaf iOS 16.4, maar alleen als je de app als PWA
          hebt geïnstalleerd (“Zet op beginscherm”).
        </p>

        {!supported ? (
          <p className="text-sm text-red-600">Deze browser ondersteunt geen Web Push.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={enable}
              disabled={busy || !userId}
              className="px-3 py-2 rounded border border-orange-500/60 hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10 disabled:opacity-50"
            >
              Inschakelen
            </button>
            <button
              onClick={disable}
              disabled={busy || !userId}
              className="px-3 py-2 rounded border border-orange-500/60 hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10 disabled:opacity-50"
            >
              Uitschakelen
            </button>
            <button
              onClick={sendTest}
              disabled={busy || !userId}
              className="px-3 py-2 rounded border border-orange-500/60 hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10 disabled:opacity-50"
            >
              Stuur test push
            </button>
          </div>
        )}

        {status ? <p className="text-sm text-gray-800 dark:text-gray-200">{status}</p> : null}
      </div>

      <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
        <p>Vereist: HTTPS (localhost is ok), VAPID keys, en een service worker.</p>
        <p>Tip: op iPhone werkt de permissie prompt alleen in de geïnstalleerde PWA.</p>
      </div>
    </main>
  )
}
