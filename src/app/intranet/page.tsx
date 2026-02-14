'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

type ProfileLite = {
  name: string | null
  email: string | null
}

type IntranetMessage = {
  id: string
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

  const mountedRef = useRef(true)

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

  const fetchMessages = async () => {
    setError(null)
    setLoading(true)

    try {
      // Prefer join to show author name/email when FK exists.
      const baseSelect =
        'id, parent_id, author_id, body, created_at, author:profiles!intranet_messages_author_id_fkey(name, email)'

      let top: any[] | null = null
      let err: any = null

      const resTop = await supabase
        .from('intranet_messages')
        .select(baseSelect)
        .is('parent_id', null)
        .order('created_at', { ascending: false })
        .limit(50)

      top = resTop.data as any[] | null
      err = resTop.error

      // Fallback if the relationship name differs or schema not yet migrated.
      if (err) {
        const resTop2 = await supabase
          .from('intranet_messages')
          .select('id, parent_id, author_id, body, created_at')
          .is('parent_id', null)
          .order('created_at', { ascending: false })
          .limit(50)
        top = resTop2.data as any[] | null
        err = resTop2.error
      }

      if (err) throw err

      const topMsgs = (top ?? []).map((r: any) => ({
        id: String(r.id),
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
          .in('parent_id', parentIds)
          .order('created_at', { ascending: true })

        if (resReplies.error) {
          const resReplies2 = await supabase
            .from('intranet_messages')
            .select('id, parent_id, author_id, body, created_at')
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
          ? `${msg}. Heb je intranet_chat.sql al uitgevoerd in Supabase?`
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

      await fetchMessages()
    }

    init()

    const { data: authSub } = supabase.auth.onAuthStateChange(async (_evt, session) => {
      const uid = session?.user?.id ?? null
      setUserId(uid)
      setIsAdmin(false)
      if (uid) await loadRole(uid)
      await fetchMessages()
    })

    const channel = supabase
      .channel('intranet-messages')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'intranet_messages' },
        () => {
          fetchMessages()
        }
      )
      .subscribe()

    return () => {
      mountedRef.current = false
      authSub?.subscription?.unsubscribe()
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const canPostAnnouncement = Boolean(userId) && isAdmin

  const postAnnouncement = async () => {
    if (!canPostAnnouncement) return
    const body = newPost.trim()
    if (!body) return

    setPosting(true)
    setError(null)

    try {
      const { error } = await supabase.from('intranet_messages').insert({
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

    const body = String(replyDrafts[parentId] ?? '').trim()
    if (!body) return

    setSendingReplyId(parentId)
    setError(null)

    try {
      const { error } = await supabase.from('intranet_messages').insert({
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
          Bedrijfsupdates (admin) + reacties.
        </p>

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
              placeholder="Schrijf een update voor iedereen…"
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
