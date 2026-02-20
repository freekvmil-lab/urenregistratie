'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

type ProfileLite = {
  name: string | null
  email: string | null
}

type IntranetChannel = {
  id: string
  name: string
  description: string | null
  is_private: boolean
  announcements_only: boolean
  created_at: string
}

type IntranetMessage = {
  id: string
  channel_id: string
  parent_id: string | null
  author_id: string
  body: string
  created_at: string
  author?: ProfileLite | null
}

function formatDateTime(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString()
}

export default function IntranetPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [userId, setUserId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  const [messages, setMessages] = useState<IntranetMessage[]>([])
  const [repliesByParent, setRepliesByParent] = useState<Record<string, IntranetMessage[]>>({})

  const [newPost, setNewPost] = useState('')
  const [posting, setPosting] = useState(false)

  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [sendingReplyId, setSendingReplyId] = useState<string | null>(null)

  const [channels, setChannels] = useState<IntranetChannel[]>([])
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null)

  const mountedRef = useRef(true)

  const activeChannel = useMemo(
    () => channels.find((c) => c.id === activeChannelId) ?? null,
    [channels, activeChannelId]
  )

  const loadRole = async (uid: string) => {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', uid)
      .maybeSingle()

    if (error) {
      console.warn('role load failed', error)
      setIsAdmin(false)
      return
    }

    setIsAdmin(profile?.role === 'admin')
  }

  const fetchChannels = async () => {
    setError(null)
    try {
      const { data, error } = await supabase
        .from('intranet_channels')
        .select('id, name, description, is_private, announcements_only, created_at')
        .order('created_at', { ascending: true })

      if (error) throw error

      const list = (data ?? []).map((c: any) => ({
        id: String(c.id),
        name: String(c.name ?? ''),
        description: c.description === null || c.description === undefined ? null : String(c.description),
        is_private: Boolean(c.is_private),
        announcements_only: Boolean(c.announcements_only),
        created_at: String(c.created_at),
      })) as IntranetChannel[]

      if (!mountedRef.current) return
      setChannels(list)

      const stored = typeof window !== 'undefined' ? window.localStorage.getItem('intranet.activeChannelId') : null
      const preferred = stored && list.some((x) => x.id === stored) ? stored : null
      const fallback = list[0]?.id ?? null
      const next = activeChannelId && list.some((x) => x.id === activeChannelId) ? activeChannelId : (preferred ?? fallback)
      if (next && next !== activeChannelId) setActiveChannelId(next)
    } catch (e: any) {
      const msg = String(e?.message ?? 'Kanalen laden mislukt')
      setError(
        msg.includes('intranet_channels')
          ? `${msg}. Heb je intranet_channels.sql al uitgevoerd in Supabase?`
          : msg
      )
      setChannels([])
    }
  }

  const adminCreateChannel = async () => {
    if (!isAdmin) return

    const nameRaw = window.prompt('Kanaalnaam (bijv. project-alpha):')
    const name = String(nameRaw ?? '').trim()
    if (!name) return

    const isPrivate = window.confirm('Privé kanaal? OK = privé, Annuleren = openbaar')
    const announcementsOnly = window.confirm('Alleen aankondigingen? OK = admin start topics, Annuleren = iedereen kan posten')
    const descRaw = window.prompt('Omschrijving (optioneel):')
    const description = String(descRaw ?? '').trim() || null

    setError(null)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const accessToken = session?.access_token
      if (!accessToken) {
        setError('Niet ingelogd.')
        return
      }

      const res = await fetch('/api/admin/intranet/channels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          name,
          description,
          is_private: isPrivate,
          announcements_only: announcementsOnly,
        }),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json?.details ? String(json.details) : json?.error ? String(json.error) : 'Kanaal maken mislukt')
        return
      }

      await fetchChannels()
      const newId = String(json?.channel?.id ?? '')
      if (newId) setActiveChannelId(newId)
    } catch (e: any) {
      setError(String(e?.message ?? 'Kanaal maken mislukt'))
    }
  }

  const adminAddMember = async () => {
    if (!isAdmin) return
    if (!activeChannelId) return

    const emailRaw = window.prompt('E-mail van werknemer om toe te voegen aan dit kanaal:')
    const email = String(emailRaw ?? '').trim().toLowerCase()
    if (!email) return

    setError(null)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const accessToken = session?.access_token
      if (!accessToken) {
        setError('Niet ingelogd.')
        return
      }

      const res = await fetch('/api/admin/intranet/members', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          channel_id: activeChannelId,
          action: 'add',
          email,
        }),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json?.details ? String(json.details) : json?.error ? String(json.error) : 'Toevoegen mislukt')
        return
      }
    } catch (e: any) {
      setError(String(e?.message ?? 'Toevoegen mislukt'))
    }
  }

  const fetchMessages = async () => {
    if (!activeChannelId) {
      setMessages([])
      setRepliesByParent({})
      setLoading(false)
      return
    }

    setError(null)
    setLoading(true)

    try {
      // Prefer join to show author name/email when FK exists.
      const baseSelect =
        'id, channel_id, parent_id, author_id, body, created_at, author:profiles!intranet_messages_author_id_fkey(name, email)'

      let top: any[] | null = null
      let err: any = null

      const resTop = await supabase
        .from('intranet_messages')
        .select(baseSelect)
        .eq('channel_id', activeChannelId)
        .is('parent_id', null)
        .order('created_at', { ascending: false })
        .limit(50)

      top = resTop.data as any[] | null
      err = resTop.error

      // Fallback if the relationship name differs or schema not yet migrated.
      if (err) {
        const resTop2 = await supabase
          .from('intranet_messages')
          .select('id, channel_id, parent_id, author_id, body, created_at')
          .eq('channel_id', activeChannelId)
          .is('parent_id', null)
          .order('created_at', { ascending: false })
          .limit(50)
        top = resTop2.data as any[] | null
        err = resTop2.error
      }

      if (err) throw err

      const topMsgs = (top ?? []).map((r: any) => ({
        id: String(r.id),
        channel_id: String(r.channel_id ?? activeChannelId),
        parent_id: r.parent_id ? String(r.parent_id) : null,
        author_id: String(r.author_id),
        body: String(r.body ?? ''),
        created_at: String(r.created_at),
        author: r.author ?? null,
      })) as IntranetMessage[]

      const parentIds = topMsgs.map((m) => m.id)
      let replies: any[] = []

      if (parentIds.length > 0) {
        const resReplies = await supabase
          .from('intranet_messages')
          .select(baseSelect)
          .eq('channel_id', activeChannelId)
          .in('parent_id', parentIds)
          .order('created_at', { ascending: true })

        if (resReplies.error) {
          const resReplies2 = await supabase
            .from('intranet_messages')
            .select('id, channel_id, parent_id, author_id, body, created_at')
            .eq('channel_id', activeChannelId)
            .in('parent_id', parentIds)
            .order('created_at', { ascending: true })

          if (resReplies2.error) throw resReplies2.error
          replies = resReplies2.data ?? []
        } else {
          replies = resReplies.data ?? []
        }
      }

      const replyMsgs = replies.map((r: any) => ({
        id: String(r.id),
        channel_id: String(r.channel_id ?? activeChannelId),
        parent_id: r.parent_id ? String(r.parent_id) : null,
        author_id: String(r.author_id),
        body: String(r.body ?? ''),
        created_at: String(r.created_at),
        author: r.author ?? null,
      })) as IntranetMessage[]

      const grouped: Record<string, IntranetMessage[]> = {}
      for (const rep of replyMsgs) {
        const pid = rep.parent_id
        if (!pid) continue
        if (!grouped[pid]) grouped[pid] = []
        grouped[pid].push(rep)
      }

      if (!mountedRef.current) return
      setMessages(topMsgs)
      setRepliesByParent(grouped)
    } catch (e: any) {
      const msg = String(e?.message ?? 'Laden mislukt')
      setError(
        msg.includes('intranet_messages')
          ? `${msg}. Heb je intranet_chat.sql + intranet_channels.sql al uitgevoerd in Supabase?`
          : msg
      )
      setMessages([])
      setRepliesByParent({})
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }

  useEffect(() => {
    mountedRef.current = true

    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      const uid = user?.id ?? null
      setUserId(uid)
      if (uid) await loadRole(uid)

      await fetchChannels()
    }

    init()

    const { data: authSub } = supabase.auth.onAuthStateChange(async (_evt, session) => {
      const uid = session?.user?.id ?? null
      setUserId(uid)
      setIsAdmin(false)
      if (uid) await loadRole(uid)
      await fetchChannels()
    })

    return () => {
      mountedRef.current = false
      authSub?.subscription?.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!activeChannelId) return
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('intranet.activeChannelId', activeChannelId)
    }
    fetchMessages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannelId])

  useEffect(() => {
    if (!activeChannelId) return

    const rt = supabase
      .channel(`intranet:${activeChannelId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'intranet_messages', filter: `channel_id=eq.${activeChannelId}` },
        () => {
          fetchMessages()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'intranet_channels' },
        () => {
          fetchChannels()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'intranet_channel_members' },
        () => {
          fetchChannels()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(rt)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannelId])

  const canPostAnnouncement = Boolean(userId) && Boolean(activeChannelId) && (
    !activeChannel?.announcements_only || isAdmin
  )

  const postAnnouncement = async () => {
    if (!canPostAnnouncement) return
    const body = newPost.trim()
    if (!body) return

    setPosting(true)
    setError(null)

    try {
      const { error } = await supabase.from('intranet_messages').insert({
        channel_id: activeChannelId,
        parent_id: null,
        author_id: userId,
        body,
      })
      if (error) throw error

      setNewPost('')
      await fetchMessages()
    } catch (e: any) {
      setError(String(e?.message ?? 'Plaatsen mislukt'))
    } finally {
      setPosting(false)
    }
  }

  const sendReply = async (parentId: string) => {
    if (!userId) {
      setError('Je bent niet ingelogd.')
      return
    }

    if (!activeChannelId) {
      setError('Geen kanaal geselecteerd.')
      return
    }

    const body = String(replyDrafts[parentId] ?? '').trim()
    if (!body) return

    setSendingReplyId(parentId)
    setError(null)

    try {
      const { error } = await supabase.from('intranet_messages').insert({
        channel_id: activeChannelId,
        parent_id: parentId,
        author_id: userId,
        body,
      })
      if (error) throw error

      setReplyDrafts((prev) => ({ ...prev, [parentId]: '' }))
      setReplyingTo(null)
      await fetchMessages()
    } catch (e: any) {
      setError(String(e?.message ?? 'Reageren mislukt'))
    } finally {
      setSendingReplyId(null)
    }
  }

  const deleteMessage = async (id: string) => {
    if (!isAdmin) return
    const ok = window.confirm('Bericht verwijderen?')
    if (!ok) return

    try {
      const { error } = await supabase.from('intranet_messages').delete().eq('id', id)
      if (error) throw error
      await fetchMessages()
    } catch (e: any) {
      setError(String(e?.message ?? 'Verwijderen mislukt'))
    }
  }

  const posts = useMemo(() => messages, [messages])

  return (
    <main className="px-4 py-4 sm:p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold">Intranet</h1>
        <p className="text-sm opacity-80 mt-1">
          Kanalen (zoals Discord) + threads + reacties.
        </p>

        <div className="mt-3 rounded border border-orange-200/60 dark:border-orange-500/30 bg-white dark:bg-black/30 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold mr-2">Kanaal:</div>
            {channels.length === 0 ? (
              <div className="text-sm opacity-70">Geen kanalen (of geen toegang).</div>
            ) : (
              channels.map((c) => {
                const active = c.id === activeChannelId
                return (
                  <button
                    key={c.id}
                    onClick={() => setActiveChannelId(c.id)}
                    className={
                      'text-sm px-3 py-2 rounded border ' +
                      (active
                        ? 'bg-orange-100 dark:bg-orange-500/10 border-orange-300/60 dark:border-orange-500/30'
                        : 'border-orange-200/60 dark:border-orange-500/30 hover:bg-orange-50 dark:hover:bg-white/5')
                    }
                    title={c.description ?? undefined}
                  >
                    #{c.name}{c.is_private ? ' (privé)' : ''}
                  </button>
                )
              })
            )}

            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={fetchChannels}
                className="text-sm px-3 py-2 rounded border border-orange-200/60 dark:border-orange-500/30 hover:bg-orange-50 dark:hover:bg-white/5"
              >
                Vernieuwen
              </button>
              {isAdmin && (
                <button
                  onClick={adminCreateChannel}
                  className="text-sm px-3 py-2 rounded border border-orange-200/60 dark:border-orange-500/30 hover:bg-orange-50 dark:hover:bg-white/5"
                >
                  + Kanaal
                </button>
              )}
              {isAdmin && activeChannel?.is_private && (
                <button
                  onClick={adminAddMember}
                  className="text-sm px-3 py-2 rounded border border-orange-200/60 dark:border-orange-500/30 hover:bg-orange-50 dark:hover:bg-white/5"
                >
                  Lid toevoegen
                </button>
              )}
            </div>
          </div>
          {activeChannel && (
            <div className="mt-2 text-xs opacity-70">
              {activeChannel.announcements_only
                ? 'Aankondigingen: admin start topics; iedereen kan reageren.'
                : 'Chat: iedereen in dit kanaal kan een topic starten.'}
            </div>
          )}
        </div>

        {!userId && (
          <div className="mt-4 rounded border border-orange-200/60 dark:border-orange-500/30 bg-white dark:bg-black/30 p-3">
            <div className="font-semibold">Niet ingelogd</div>
            <div className="text-sm opacity-80">Log in om te reageren.</div>
          </div>
        )}

        {canPostAnnouncement && (
          <div className="mt-4 rounded border border-orange-200/60 dark:border-orange-500/30 bg-white dark:bg-black/30 p-4">
            <div className="font-semibold mb-2">Nieuwe update</div>
            <textarea
              value={newPost}
              onChange={(e) => setNewPost(e.target.value)}
              rows={3}
              className="w-full rounded border px-3 py-2 bg-transparent"
              placeholder={activeChannel?.announcements_only ? 'Schrijf een update…' : 'Schrijf een bericht…'}
            />
            <div className="mt-2 flex items-center gap-3">
              <button
                onClick={postAnnouncement}
                disabled={posting || !newPost.trim()}
                className="bg-orange-600 text-white px-3 py-2 rounded hover:bg-orange-700 disabled:opacity-50"
              >
                {posting ? 'Plaatsen…' : 'Plaatsen'}
              </button>
              <button
                onClick={fetchMessages}
                className="text-sm text-orange-700 hover:text-orange-900 dark:text-orange-300 dark:hover:text-orange-200"
              >
                Verversen
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 text-sm text-red-700 dark:text-red-300">{error}</div>
        )}

        <div className="mt-6">
          {loading ? (
            <div className="text-sm opacity-70">Laden…</div>
          ) : posts.length === 0 ? (
            <div className="rounded border border-orange-200/60 dark:border-orange-500/30 bg-white dark:bg-black/30 p-4">
              <div className="font-semibold">Nog geen updates</div>
              <div className="text-sm opacity-80">Admin kan hier een eerste bericht plaatsen.</div>
            </div>
          ) : (
            <div className="space-y-4">
              {posts.map((p) => {
                const replies = repliesByParent[p.id] ?? []
                const authorLabel = p.author?.name || p.author?.email || p.author_id

                return (
                  <div
                    key={p.id}
                    className="rounded border border-orange-200/60 dark:border-orange-500/30 bg-white dark:bg-black/30 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm opacity-80">{formatDateTime(p.created_at)}</div>
                        <div className="font-semibold">{authorLabel}</div>
                      </div>
                      {isAdmin && (
                        <button
                          onClick={() => deleteMessage(p.id)}
                          className="text-sm text-red-600 hover:text-red-800"
                        >
                          Verwijder
                        </button>
                      )}
                    </div>

                    <div className="mt-3 whitespace-pre-wrap">{p.body}</div>

                    <div className="mt-4">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold">Reacties ({replies.length})</div>
                        {userId && (
                          <button
                            onClick={() => setReplyingTo((cur) => (cur === p.id ? null : p.id))}
                            className="text-sm text-orange-700 hover:text-orange-900 dark:text-orange-300 dark:hover:text-orange-200"
                          >
                            Reageren
                          </button>
                        )}
                      </div>

                      {replies.length > 0 && (
                        <div className="mt-2 space-y-2">
                          {replies.map((r) => {
                            const replyAuthor = r.author?.name || r.author?.email || r.author_id
                            return (
                              <div
                                key={r.id}
                                className="rounded border border-orange-200/60 dark:border-orange-500/30 bg-white/70 dark:bg-black/20 p-3"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="text-xs opacity-80">{formatDateTime(r.created_at)}</div>
                                    <div className="text-sm font-semibold">{replyAuthor}</div>
                                  </div>
                                  {isAdmin && (
                                    <button
                                      onClick={() => deleteMessage(r.id)}
                                      className="text-xs text-red-600 hover:text-red-800"
                                    >
                                      Verwijder
                                    </button>
                                  )}
                                </div>
                                <div className="mt-2 text-sm whitespace-pre-wrap">{r.body}</div>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {replyingTo === p.id && userId && (
                        <div className="mt-3">
                          <textarea
                            value={replyDrafts[p.id] ?? ''}
                            onChange={(e) =>
                              setReplyDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))
                            }
                            rows={2}
                            className="w-full rounded border px-3 py-2 bg-transparent"
                            placeholder="Schrijf een reactie…"
                          />
                          <div className="mt-2 flex items-center gap-3">
                            <button
                              onClick={() => sendReply(p.id)}
                              disabled={sendingReplyId === p.id || !(replyDrafts[p.id] ?? '').trim()}
                              className="bg-orange-600 text-white px-3 py-2 rounded hover:bg-orange-700 disabled:opacity-50"
                            >
                              {sendingReplyId === p.id ? 'Versturen…' : 'Verstuur'}
                            </button>
                            <button
                              onClick={() => setReplyingTo(null)}
                              className="text-sm underline opacity-80"
                            >
                              Annuleren
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
