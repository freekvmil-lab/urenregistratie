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
  reply_to_id?: string | null
  author_id: string
  body: string
  created_at: string
  author?: ProfileLite | null
}

type AdminProfileLite = {
  id: string
  name: string | null
  email: string | null
  role: string
  deleted_at: string | null
}

type ChannelMember = {
  member_id: string
  created_at: string
  profile: AdminProfileLite | null
}

type ChannelMemberListItem = {
  member_id: string
  name: string | null
  email: string | null
  role: string | null
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
  const [newThreadOpen, setNewThreadOpen] = useState(false)

  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [sendingReplyId, setSendingReplyId] = useState<string | null>(null)

  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null)

  const [channels, setChannels] = useState<IntranetChannel[]>([])
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null)

  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const [rtNonce, setRtNonce] = useState(0)

  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingDraft, setEditingDraft] = useState('')
  const [savingEditId, setSavingEditId] = useState<string | null>(null)

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [channelMembersLoading, setChannelMembersLoading] = useState(false)
  const [channelMembers, setChannelMembers] = useState<ChannelMemberListItem[]>([])

  const [channelModalOpen, setChannelModalOpen] = useState(false)
  const [channelModalMode, setChannelModalMode] = useState<'create' | 'edit'>('create')
  const [channelName, setChannelName] = useState('')
  const [channelDesc, setChannelDesc] = useState('')
  const [channelPrivate, setChannelPrivate] = useState(true)
  const [channelAnnouncementsOnly, setChannelAnnouncementsOnly] = useState(false)
  const [channelSaving, setChannelSaving] = useState(false)

  const [membersOpen, setMembersOpen] = useState(false)
  const [membersLoading, setMembersLoading] = useState(false)
  const [members, setMembers] = useState<ChannelMember[]>([])
  const [profilesLoading, setProfilesLoading] = useState(false)
  const [profiles, setProfiles] = useState<AdminProfileLite[]>([])
  const [profilePickId, setProfilePickId] = useState<string>('')
  const [memberMutating, setMemberMutating] = useState<string | null>(null)

  const mountedRef = useRef(true)
  const replyTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadingWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const channelMembersLoadingWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchMessagesSeqRef = useRef(0)
  const fetchChannelsSeqRef = useRef(0)
  const loadChannelMembersSeqRef = useRef(0)

  const lastMessagesFetchAtRef = useRef<number>(0)
  const lastChannelsFetchAtRef = useRef<number>(0)
  const lastChannelMembersFetchAtRef = useRef<number>(0)

  const messagesRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const channelsRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const channelMembersRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const activeChannel = useMemo(
    () => channels.find((c) => c.id === activeChannelId) ?? null,
    [channels, activeChannelId]
  )

  const selectedThread = useMemo(
    () => messages.find((m) => m.id === selectedThreadId) ?? null,
    [messages, selectedThreadId]
  )

  const selectedThreadReplies = useMemo(
    () => (selectedThreadId ? (repliesByParent[selectedThreadId] ?? []) : []),
    [repliesByParent, selectedThreadId]
  )

  const repliesNested = useMemo(() => {
    const ROOT = '__root__'
    const byParent = new Map<string, IntranetMessage[]>()

    if (!selectedThread) {
      return { ROOT, byParent, roots: [] as IntranetMessage[] }
    }

    const knownIds = new Set<string>([selectedThread.id])
    for (const r of selectedThreadReplies) knownIds.add(r.id)

    const push = (key: string, msg: IntranetMessage) => {
      const list = byParent.get(key)
      if (list) list.push(msg)
      else byParent.set(key, [msg])
    }

    for (const r of selectedThreadReplies) {
      const raw = r.reply_to_id ? String(r.reply_to_id) : null
      const key =
        !raw || raw === selectedThread.id || !knownIds.has(raw)
          ? ROOT
          : raw

      push(key, r)
    }

    return { ROOT, byParent, roots: byParent.get(ROOT) ?? [] }
  }, [selectedThread, selectedThreadReplies])

  const replyLookup = useMemo(() => {
    const map = new Map<string, IntranetMessage>()
    if (selectedThread) map.set(selectedThread.id, selectedThread)
    for (const r of selectedThreadReplies) map.set(r.id, r)
    return map
  }, [selectedThread, selectedThreadReplies])

  const replyingToMessage = useMemo(() => {
    if (!replyingTo) return null
    return replyLookup.get(replyingTo) ?? null
  }, [replyLookup, replyingTo])

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current)
        highlightTimeoutRef.current = null
      }
    }
  }, [])

  const scrollToMessage = (messageId: string) => {
    const el = typeof document !== 'undefined' ? document.getElementById(`msg-${messageId}`) : null
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightMessageId(messageId)
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current)
    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightMessageId((prev) => (prev === messageId ? null : prev))
    }, 1800)
  }

  const loadChannelMembers = async (opts?: { silent?: boolean; channelId?: string | null; uid?: string | null }) => {
    const silent = Boolean(opts?.silent)
    const channelId = opts?.channelId ?? activeChannelId
    const uid = opts?.uid ?? userId

    const seq = ++loadChannelMembersSeqRef.current

    if (!channelId || !uid) {
      if (seq !== loadChannelMembersSeqRef.current) return
      setChannelMembers([])
      setChannelMembersLoading(false)
      return
    }

    if (!silent) {
      setChannelMembersLoading(true)
      if (channelMembersLoadingWatchdogRef.current) clearTimeout(channelMembersLoadingWatchdogRef.current)
      channelMembersLoadingWatchdogRef.current = setTimeout(() => {
        if (!mountedRef.current) return
        setChannelMembersLoading(false)
      }, 20000)
    }
    try {
      const { data, error } = await supabase.rpc('intranet_list_channel_members', {
        p_channel_id: channelId,
      })
      if (error) throw error
      if (seq !== loadChannelMembersSeqRef.current) return
      setChannelMembers((data ?? []) as ChannelMemberListItem[])
      lastChannelMembersFetchAtRef.current = Date.now()
    } catch (e: any) {
      console.warn('loadChannelMembers failed', e)
      if (silent) return
      if (seq !== loadChannelMembersSeqRef.current) return
      setChannelMembers([])
    } finally {
      if (channelMembersLoadingWatchdogRef.current) {
        clearTimeout(channelMembersLoadingWatchdogRef.current)
        channelMembersLoadingWatchdogRef.current = null
      }
      if (seq === loadChannelMembersSeqRef.current) setChannelMembersLoading(false)
    }
  }

  const loadRole = async (uid: string) => {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', uid)
      .maybeSingle()

    if (error) {
      console.warn('role load failed', error)
      return
    }

    setIsAdmin(profile?.role === 'admin')
  }

  const fetchChannels = async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent)
    const seq = ++fetchChannelsSeqRef.current
    if (!silent) setError(null)
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
      if (seq !== fetchChannelsSeqRef.current) return
      setChannels(list)
      lastChannelsFetchAtRef.current = Date.now()

      const stored = typeof window !== 'undefined' ? window.localStorage.getItem('intranet.activeChannelId') : null
      const preferred = stored && list.some((x) => x.id === stored) ? stored : null
      const fallback = list[0]?.id ?? null
      const next = activeChannelId && list.some((x) => x.id === activeChannelId) ? activeChannelId : (preferred ?? fallback)
      if (next && next !== activeChannelId) setActiveChannelId(next)
    } catch (e: any) {
      if (silent) return
      if (seq !== fetchChannelsSeqRef.current) return
      const msg = String(e?.message ?? 'Kanalen laden mislukt')
      setError(msg.includes('intranet_channels') ? `${msg}. Heb je intranet_channels.sql al uitgevoerd in Supabase?` : msg)
      // Keep existing channels in UI on transient errors.
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

  const fetchMessages = async (opts?: { silent?: boolean; channelId?: string | null }) => {
    const silent = Boolean(opts?.silent)
    const channelId = opts?.channelId ?? activeChannelId
    const seq = ++fetchMessagesSeqRef.current

    const hasCachedData = messages.length > 0 || Object.keys(repliesByParent).length > 0

    if (!channelId) {
      if (seq !== fetchMessagesSeqRef.current) return
      setMessages([])
      setRepliesByParent({})
      setLoading(false)
      return
    }

    if (!silent) setError(null)
    // Only show a blocking loader if we don't have anything to render yet.
    if (!silent && !hasCachedData) {
      setLoading(true)
      if (loadingWatchdogRef.current) clearTimeout(loadingWatchdogRef.current)
      loadingWatchdogRef.current = setTimeout(() => {
        if (!mountedRef.current) return
        if (seq !== fetchMessagesSeqRef.current) return
        setLoading(false)
        setError('Laden duurt te lang. Controleer je verbinding en klik op ↻ (of herconnect).')
      }, 20000)
    }

    try {
      // Prefer join to show author name/email when FK exists.
      const baseSelect =
        'id, channel_id, parent_id, reply_to_id, author_id, body, created_at, author:profiles!intranet_messages_author_id_fkey(name, email)'

      let top: any[] | null = null
      let err: any = null

      const resTop = await supabase
        .from('intranet_messages')
        .select(baseSelect)
        .eq('channel_id', channelId)
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
          .eq('channel_id', channelId)
          .is('parent_id', null)
          .order('created_at', { ascending: false })
          .limit(50)
        top = resTop2.data as any[] | null
        err = resTop2.error
      }

      if (err) throw err

      const topMsgs = (top ?? []).map((r: any) => ({
        id: String(r.id),
        channel_id: String(r.channel_id ?? channelId),
        parent_id: r.parent_id ? String(r.parent_id) : null,
        reply_to_id: r.reply_to_id ? String(r.reply_to_id) : null,
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
          .eq('channel_id', channelId)
          .in('parent_id', parentIds)
          .order('created_at', { ascending: true })

        if (resReplies.error) {
          const resReplies2 = await supabase
            .from('intranet_messages')
            .select('id, channel_id, parent_id, author_id, body, created_at')
            .eq('channel_id', channelId)
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
        channel_id: String(r.channel_id ?? channelId),
        parent_id: r.parent_id ? String(r.parent_id) : null,
        reply_to_id: r.reply_to_id ? String(r.reply_to_id) : null,
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
      if (seq !== fetchMessagesSeqRef.current) return
      setMessages(topMsgs)
      setRepliesByParent(grouped)
      setError(null)
      lastMessagesFetchAtRef.current = Date.now()
    } catch (e: any) {
      if (!mountedRef.current) return
      if (seq !== fetchMessagesSeqRef.current) return

      if (silent) {
        console.warn('fetchMessages failed (silent)', e)
        return
      }

      const msg = String(e?.message ?? 'Laden mislukt')
      setError(
        msg.includes('intranet_messages')
          ? `${msg}. Heb je intranet_chat.sql + intranet_channels.sql al uitgevoerd in Supabase?`
          : msg
      )
      setMessages([])
      setRepliesByParent({})
    } finally {
      if (loadingWatchdogRef.current) {
        clearTimeout(loadingWatchdogRef.current)
        loadingWatchdogRef.current = null
      }
      if (mountedRef.current && seq === fetchMessagesSeqRef.current) setLoading(false)
    }
  }

  const scheduleFetchMessages = (channelId: string | null, opts?: { silent?: boolean; debounceMs?: number }) => {
    const silent = opts?.silent ?? true
    const debounceMs = opts?.debounceMs ?? 250
    if (Date.now() - lastMessagesFetchAtRef.current < 400) return
    if (messagesRefreshTimerRef.current) clearTimeout(messagesRefreshTimerRef.current)
    messagesRefreshTimerRef.current = setTimeout(() => {
      fetchMessages({ silent, channelId })
    }, debounceMs)
  }

  const scheduleFetchChannels = (opts?: { silent?: boolean; debounceMs?: number }) => {
    const silent = opts?.silent ?? true
    const debounceMs = opts?.debounceMs ?? 350
    if (Date.now() - lastChannelsFetchAtRef.current < 500) return
    if (channelsRefreshTimerRef.current) clearTimeout(channelsRefreshTimerRef.current)
    channelsRefreshTimerRef.current = setTimeout(() => {
      fetchChannels({ silent })
    }, debounceMs)
  }

  const scheduleLoadChannelMembers = (channelId: string | null, uid: string | null, opts?: { silent?: boolean; debounceMs?: number }) => {
    const silent = opts?.silent ?? true
    const debounceMs = opts?.debounceMs ?? 350
    if (Date.now() - lastChannelMembersFetchAtRef.current < 500) return
    if (channelMembersRefreshTimerRef.current) clearTimeout(channelMembersRefreshTimerRef.current)
    channelMembersRefreshTimerRef.current = setTimeout(() => {
      loadChannelMembers({ silent, channelId, uid })
    }, debounceMs)
  }

  const reconnect = async () => {
    // Force realtime resubscribe + a visible refresh.
    setRtNonce((n) => n + 1)
    await fetchChannels({ silent: false })
    if (activeChannelId) {
      await fetchMessages({ silent: false, channelId: activeChannelId })
      await loadChannelMembers({ silent: false, channelId: activeChannelId, uid: userId })
    }
  }

  const getAccessToken = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }

  const openCreateChannel = () => {
    setChannelModalMode('create')
    setChannelName('')
    setChannelDesc('')
    setChannelPrivate(true)
    setChannelAnnouncementsOnly(false)
    setChannelModalOpen(true)
  }

  const openEditChannel = () => {
    if (!activeChannel) return
    setChannelModalMode('edit')
    setChannelName(activeChannel.name)
    setChannelDesc(activeChannel.description ?? '')
    setChannelPrivate(activeChannel.is_private)
    setChannelAnnouncementsOnly(activeChannel.announcements_only)
    setChannelModalOpen(true)
  }

  const saveChannel = async () => {
    if (!isAdmin) return
    const name = channelName.trim()
    if (!name) {
      setError('Kanaalnaam is verplicht.')
      return
    }

    setChannelSaving(true)
    setError(null)
    try {
      const token = await getAccessToken()
      if (!token) {
        setError('Niet ingelogd.')
        return
      }

      if (channelModalMode === 'create') {
        const res = await fetch('/api/admin/intranet/channels', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name,
            description: channelDesc.trim() || null,
            is_private: channelPrivate,
            announcements_only: channelAnnouncementsOnly,
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
      } else {
        if (!activeChannelId) return
        const res = await fetch(`/api/admin/intranet/channels/${encodeURIComponent(activeChannelId)}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name,
            description: channelDesc.trim() || null,
            is_private: channelPrivate,
            announcements_only: channelAnnouncementsOnly,
          }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(json?.details ? String(json.details) : json?.error ? String(json.error) : 'Kanaal opslaan mislukt')
          return
        }
        await fetchChannels()
      }

      setChannelModalOpen(false)
    } catch (e: any) {
      setError(String(e?.message ?? 'Kanaal opslaan mislukt'))
    } finally {
      setChannelSaving(false)
    }
  }

  const deleteChannel = async () => {
    if (!isAdmin) return
    if (!activeChannelId) return
    const ok = window.confirm('Kanaal verwijderen? Alle berichten in dit kanaal worden ook verwijderd.')
    if (!ok) return

    setError(null)
    try {
      const token = await getAccessToken()
      if (!token) {
        setError('Niet ingelogd.')
        return
      }
      const res = await fetch(`/api/admin/intranet/channels/${encodeURIComponent(activeChannelId)}?confirm=true`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json?.details ? String(json.details) : json?.error ? String(json.error) : 'Kanaal verwijderen mislukt')
        return
      }
      setSelectedThreadId(null)
      await fetchChannels()
    } catch (e: any) {
      setError(String(e?.message ?? 'Kanaal verwijderen mislukt'))
    }
  }

  const loadMembers = async () => {
    if (!isAdmin) return
    if (!activeChannelId) return

    setMembersLoading(true)
    setError(null)
    try {
      const token = await getAccessToken()
      if (!token) {
        setError('Niet ingelogd.')
        return
      }

      const res = await fetch(`/api/admin/intranet/members?channel_id=${encodeURIComponent(activeChannelId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json?.details ? String(json.details) : json?.error ? String(json.error) : 'Leden laden mislukt')
        return
      }
      setMembers((json?.members ?? []) as ChannelMember[])
    } catch (e: any) {
      setError(String(e?.message ?? 'Leden laden mislukt'))
    } finally {
      setMembersLoading(false)
    }
  }

  const loadProfilesAlphabetical = async () => {
    if (!isAdmin) return
    setProfilesLoading(true)
    setError(null)
    try {
      const token = await getAccessToken()
      if (!token) {
        setError('Niet ingelogd.')
        return
      }
      const res = await fetch(`/api/admin/intranet/profiles?limit=500`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json?.details ? String(json.details) : json?.error ? String(json.error) : 'Profielen laden mislukt')
        return
      }
      setProfiles((json?.profiles ?? []) as AdminProfileLite[])
    } catch (e: any) {
      setError(String(e?.message ?? 'Profielen laden mislukt'))
    } finally {
      setProfilesLoading(false)
    }
  }

  const setMember = async (profileId: string, shouldBeMember: boolean) => {
    if (!isAdmin) return
    if (!activeChannelId) return
    setMemberMutating(profileId)
    setError(null)
    try {
      const token = await getAccessToken()
      if (!token) {
        setError('Niet ingelogd.')
        return
      }
      const res = await fetch('/api/admin/intranet/members', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          channel_id: activeChannelId,
          action: shouldBeMember ? 'add' : 'remove',
          member_id: profileId,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json?.details ? String(json.details) : json?.error ? String(json.error) : 'Opslaan mislukt')
        return
      }
      await loadMembers()
      await loadChannelMembers()
    } catch (e: any) {
      setError(String(e?.message ?? 'Opslaan mislukt'))
    } finally {
      setMemberMutating(null)
    }
  }

  const availableProfiles = useMemo(() => {
    const memberIds = new Set(members.map((m) => m.member_id))
    return profiles
      .filter((p) => !p.deleted_at)
      .filter((p) => !memberIds.has(p.id))
  }, [profiles, members])

  const startEdit = (msg: IntranetMessage) => {
    if (!userId) return
    if (msg.author_id !== userId) return
    setEditingMessageId(msg.id)
    setEditingDraft(msg.body ?? '')
  }

  const cancelEdit = () => {
    setEditingMessageId(null)
    setEditingDraft('')
  }

  const saveEdit = async (messageId: string) => {
    if (!userId) {
      setError('Je bent niet ingelogd.')
      return
    }

    const body = editingDraft.trim()
    if (!body) return

    setSavingEditId(messageId)
    setError(null)
    try {
      const { error } = await supabase.from('intranet_messages').update({ body }).eq('id', messageId)
      if (error) throw error
      cancelEdit()
      await fetchMessages()
    } catch (e: any) {
      setError(String(e?.message ?? 'Bewerken mislukt'))
    } finally {
      setSavingEditId(null)
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

    const { data: authSub } = supabase.auth.onAuthStateChange(async (evt, session) => {
      const uid = session?.user?.id ?? null
      setUserId(uid)
      if (!uid) {
        setIsAdmin(false)
      } else {
        // Avoid showing stale admin UI when a different user signs in.
        if (evt === 'SIGNED_IN') setIsAdmin(false)
        await loadRole(uid)
      }
      await fetchChannels()
    })

    return () => {
      mountedRef.current = false
      authSub?.subscription?.unsubscribe()

      if (messagesRefreshTimerRef.current) clearTimeout(messagesRefreshTimerRef.current)
      if (channelsRefreshTimerRef.current) clearTimeout(channelsRefreshTimerRef.current)
      if (channelMembersRefreshTimerRef.current) clearTimeout(channelMembersRefreshTimerRef.current)

      if (loadingWatchdogRef.current) clearTimeout(loadingWatchdogRef.current)
      if (channelMembersLoadingWatchdogRef.current) clearTimeout(channelMembersLoadingWatchdogRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      scheduleFetchChannels({ silent: true, debounceMs: 0 })
      scheduleFetchMessages(activeChannelId, { silent: true, debounceMs: 0 })
      scheduleLoadChannelMembers(activeChannelId, userId, { silent: true, debounceMs: 0 })
    }

    const onOnline = () => {
      scheduleFetchChannels({ silent: true, debounceMs: 0 })
      scheduleFetchMessages(activeChannelId, { silent: true, debounceMs: 0 })
      scheduleLoadChannelMembers(activeChannelId, userId, { silent: true, debounceMs: 0 })
    }

    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility)
    if (typeof window !== 'undefined') window.addEventListener('online', onOnline)

    return () => {
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility)
      if (typeof window !== 'undefined') window.removeEventListener('online', onOnline)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannelId, userId])

  useEffect(() => {
    if (!activeChannelId) return
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('intranet.activeChannelId', activeChannelId)
    }
    if (messagesRefreshTimerRef.current) clearTimeout(messagesRefreshTimerRef.current)
    if (channelMembersRefreshTimerRef.current) clearTimeout(channelMembersRefreshTimerRef.current)

    // Avoid showing threads from the previous channel.
    setSelectedThreadId(null)
    setReplyingTo(null)
    setMessages([])
    setRepliesByParent({})
    setLoading(true)

    fetchMessages({ channelId: activeChannelId, silent: false })
    loadChannelMembers({ channelId: activeChannelId, uid: userId, silent: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannelId])

  useEffect(() => {
    if (!userId) {
      setChannelMembers([])
      return
    }
    if (activeChannelId) loadChannelMembers({ channelId: activeChannelId, uid: userId, silent: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  useEffect(() => {
    if (!activeChannelId) return

    const rt = supabase
      .channel(`intranet:${activeChannelId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'intranet_messages', filter: `channel_id=eq.${activeChannelId}` },
        () => {
          scheduleFetchMessages(activeChannelId, { silent: true })
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'intranet_channels' },
        () => {
          scheduleFetchChannels({ silent: true })
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'intranet_channel_members' },
        () => {
          scheduleFetchChannels({ silent: true })
          scheduleLoadChannelMembers(activeChannelId, userId, { silent: true })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(rt)

      if (messagesRefreshTimerRef.current) clearTimeout(messagesRefreshTimerRef.current)
      if (channelsRefreshTimerRef.current) clearTimeout(channelsRefreshTimerRef.current)
      if (channelMembersRefreshTimerRef.current) clearTimeout(channelMembersRefreshTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannelId, userId, rtNonce])

  const canPostAnnouncement = Boolean(userId) && Boolean(activeChannelId) && (
    !activeChannel?.announcements_only || isAdmin
  )

  const postAnnouncement = async () => {
    if (!canPostAnnouncement) return false
    const body = newPost.trim()
    if (!body) return false

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
      return true
    } catch (e: any) {
      setError(String(e?.message ?? 'Plaatsen mislukt'))
      return false
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
      const replyToId = replyingTo && replyingTo !== parentId ? replyingTo : null
      const payload: any = {
        channel_id: activeChannelId,
        parent_id: parentId,
        author_id: userId,
        body,
      }
      if (replyToId) payload.reply_to_id = replyToId

      let { error } = await supabase.from('intranet_messages').insert(payload)
      if (error && String(error?.message ?? '').toLowerCase().includes('reply_to_id')) {
        // Backward compat if SQL migration hasn't been applied yet.
        delete payload.reply_to_id
        ;({ error } = await supabase.from('intranet_messages').insert(payload))
      }
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

  const canStartThread = Boolean(userId) && Boolean(activeChannelId) && (
    !activeChannel?.announcements_only || isAdmin
  )

  const pillBtn =
    'text-sm px-3 py-1.5 rounded-xl border border-black/20 dark:border-white/15 ' +
    'text-black dark:text-white bg-white/40 dark:bg-white/5 hover:bg-white/60 dark:hover:bg-white/10 ' +
    'shadow-sm hover:shadow transition ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-black/40 dark:focus-visible:ring-white/25 focus-visible:ring-offset-2 ' +
    'focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900'

  const pillBtnSm =
    'text-xs px-2 py-1 rounded-xl border border-black/20 dark:border-white/15 ' +
    'text-black dark:text-white bg-white/40 dark:bg-white/5 hover:bg-white/60 dark:hover:bg-white/10 ' +
    'shadow-sm hover:shadow transition ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-black/40 dark:focus-visible:ring-white/25 focus-visible:ring-offset-2 ' +
    'focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900'

  const pillBtnIcon =
    'text-sm px-2 py-1 rounded-xl border border-black/20 dark:border-white/15 ' +
    'text-black dark:text-white bg-white/40 dark:bg-white/5 hover:bg-white/60 dark:hover:bg-white/10 ' +
    'shadow-sm hover:shadow transition ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-black/40 dark:focus-visible:ring-white/25 focus-visible:ring-offset-2 ' +
    'focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900'

  const pillBtnPrimary =
    'text-sm px-3 py-2 rounded-xl bg-orange-600 text-white hover:bg-orange-700 active:bg-orange-800 ' +
    'shadow-sm hover:shadow transition disabled:opacity-50 disabled:pointer-events-none ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/70 focus-visible:ring-offset-2 ' +
    'focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900'

  const pillBtnDanger =
    'text-sm px-3 py-2 rounded-xl border border-red-200 text-red-700 hover:bg-red-50 ' +
    'dark:border-red-500/30 dark:text-red-200 dark:hover:bg-red-500/10 ' +
    'shadow-sm hover:shadow transition disabled:opacity-50 disabled:pointer-events-none ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/70 focus-visible:ring-offset-2 ' +
    'focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900'

  const pillBtnSuccess =
    'text-sm px-3 py-2 rounded-xl border border-green-200 text-green-700 hover:bg-green-50 ' +
    'dark:border-green-500/30 dark:text-green-200 dark:hover:bg-green-500/10 ' +
    'shadow-sm hover:shadow transition disabled:opacity-50 disabled:pointer-events-none ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500/70 focus-visible:ring-offset-2 ' +
    'focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900'

  return (
    <div className="h-[calc(100dvh-56px)] sm:h-[calc(100dvh-72px)] flex bg-white dark:bg-black/30 text-gray-900 dark:text-gray-100">
      {/* Channels sidebar */}
      <aside className="w-72 border-r border-orange-200/60 dark:border-orange-500/30 hidden lg:flex flex-col min-w-0">
        <div className="p-3 border-b border-orange-200/60 dark:border-orange-500/30 flex items-center justify-between gap-2">
          <div className="font-bold truncate">Intranet</div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={openCreateChannel}
                className={pillBtnIcon}
              >
                +
              </button>
            )}
          </div>
        </div>

        <div className="p-2 overflow-auto">
          {channels.length === 0 ? (
            <div className="text-sm opacity-70 p-2">Geen kanalen (of geen toegang).</div>
          ) : (
            <div className="space-y-1">
              {channels.map((c) => {
                const active = c.id === activeChannelId
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setActiveChannelId(c.id)
                      setSelectedThreadId(null)
                    }}
                    className={
                      'w-full text-left px-3 py-2 rounded border ' +
                      (active
                        ? 'bg-orange-100 dark:bg-orange-500/10 border-orange-300/60 dark:border-orange-500/30'
                        : 'border-transparent hover:bg-orange-50 dark:hover:bg-white/5')
                    }
                    title={c.description ?? undefined}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate">#{c.name}</div>
                      {c.is_private && <span className="text-[10px] opacity-70">privé</span>}
                    </div>
                    {c.description && <div className="text-xs opacity-70 truncate">{c.description}</div>}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="px-3 py-2 border-t border-orange-200/60 dark:border-orange-500/30 flex items-center justify-between gap-2">
          <div className="font-semibold text-sm truncate">Threads</div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (!canStartThread) return
                setNewPost('')
                setNewThreadOpen(true)
              }}
              disabled={!canStartThread}
              className={pillBtnIcon + ' disabled:opacity-50'}
              title={
                !activeChannelId
                  ? 'Selecteer eerst een kanaal'
                  : !userId
                    ? 'Log in om een thread te starten'
                    : activeChannel?.announcements_only && !isAdmin
                      ? 'Alleen admin kan in dit kanaal threads starten'
                      : 'Nieuwe thread'
              }
            >
              +
            </button>
          </div>
        </div>

        <div className="p-2 flex-1 overflow-auto">
          {!activeChannelId ? (
            <div className="text-sm opacity-70 p-2">Selecteer eerst een kanaal.</div>
          ) : loading && posts.length === 0 ? (
            <div className="text-sm opacity-70 p-2">Laden…</div>
          ) : posts.length === 0 ? (
            <div className="text-sm opacity-70 p-2">Nog geen threads.</div>
          ) : (
            <div className="space-y-1">
              {posts.map((t) => {
                const selected = t.id === selectedThreadId
                const replies = repliesByParent[t.id] ?? []
                const preview = String(t.body ?? '').split('\n')[0] || '(leeg)'
                const authorLabel = t.author?.name || t.author?.email || t.author_id
                return (
                  <div
                    key={t.id}
                    className={
                      'w-full rounded border flex items-stretch gap-1 ' +
                      (selected
                        ? 'bg-orange-100 dark:bg-orange-500/10 border-orange-300/60 dark:border-orange-500/30'
                        : 'border-transparent hover:bg-orange-50 dark:hover:bg-white/5')
                    }
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedThreadId(t.id)
                        setReplyingTo(null)
                      }}
                      className="flex-1 min-w-0 text-left px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs opacity-70 truncate">{authorLabel}</div>
                        <div className="text-[10px] opacity-60 shrink-0">{replies.length}</div>
                      </div>
                      <div className="text-sm font-semibold truncate">{preview}</div>
                      <div className="text-[10px] opacity-60 truncate">{formatDateTime(t.created_at)}</div>
                    </button>

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          await deleteMessage(t.id)
                          setReplyingTo(null)
                          setSelectedThreadId((prev) => (prev === t.id ? null : prev))
                        }}
                        className="px-2 text-xs opacity-70 hover:opacity-100 hover:text-red-700"
                        title="Thread verwijderen"
                        aria-label="Thread verwijderen"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0">
        <div className="p-2 sm:p-3 border-b border-orange-200/60 dark:border-orange-500/30 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="lg:hidden mb-2 flex items-center gap-2">
              <button
                onClick={() => setMobileNavOpen(true)}
                className={pillBtn}
              >
                Kanalen / threads
              </button>
            </div>
            <div className="text-lg font-bold truncate">
              {activeChannel ? `#${activeChannel.name}` : 'Selecteer een kanaal'}
            </div>
            <div className="text-sm opacity-70 truncate">
              {activeChannel?.announcements_only
                ? 'Bedrijfsupdates: admin start topics; iedereen kan reageren.'
                : 'Chat: iedereen kan een topic starten.'}
            </div>
          </div>

          {isAdmin && activeChannel && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  setMembersOpen(true)
                  loadMembers()
                  loadProfilesAlphabetical()
                }}
                className={pillBtn}
              >
                Leden
              </button>
              <button
                onClick={openEditChannel}
                className={pillBtn}
              >
                Instellingen
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto p-2 sm:p-4">
          {!userId && (
            <div className="mb-4 rounded border border-orange-200/60 dark:border-orange-500/30 bg-white dark:bg-black/30 p-3">
              <div className="font-semibold">Niet ingelogd</div>
              <div className="text-sm opacity-80">Log in om te reageren.</div>
            </div>
          )}

          {error && (
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="text-sm text-red-700 dark:text-red-300">{error}</div>
              <button
                type="button"
                onClick={reconnect}
                className={pillBtn}
              >
                Herconnect
              </button>
            </div>
          )}

          {!activeChannelId ? (
            <div className="rounded border border-orange-200/60 dark:border-orange-500/30 bg-white dark:bg-black/30 p-4">
              <div className="font-semibold">Selecteer een kanaal</div>
              <div className="text-sm opacity-80">Kies links een kanaal om threads te zien.</div>
            </div>
          ) : loading && posts.length === 0 ? (
            <div className="text-sm opacity-70">Laden…</div>
          ) : !selectedThread ? (
            <div className="rounded border border-orange-200/60 dark:border-orange-500/30 bg-white dark:bg-black/30 p-3 sm:p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold">Threads</div>
                <div className="text-xs opacity-70">Klik om te openen</div>
              </div>

              <div className="mt-3">
                {posts.length === 0 ? (
                  <div className="text-sm opacity-70">Nog geen threads.</div>
                ) : (
                  <div className="space-y-2">
                    {posts.map((t) => {
                      const replies = repliesByParent[t.id] ?? []
                      const preview = String(t.body ?? '').split('\n')[0] || '(leeg)'
                      const authorLabel = t.author?.name || t.author?.email || t.author_id

                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setSelectedThreadId(t.id)
                            setReplyingTo(null)
                          }}
                          className="w-full text-left rounded border border-orange-200/60 dark:border-orange-500/30 bg-white/70 dark:bg-black/20 p-3 hover:bg-orange-50 dark:hover:bg-white/5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs opacity-70 truncate">{authorLabel}</div>
                            <div className="text-[10px] opacity-60 shrink-0">{replies.length}</div>
                          </div>
                          <div className="mt-1 text-sm font-semibold truncate">{preview}</div>
                          <div className="mt-1 text-[10px] opacity-60 truncate">{formatDateTime(t.created_at)}</div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <div
                id={`msg-${selectedThread.id}`}
                className={
                  "rounded border border-orange-200/60 dark:border-orange-500/30 bg-white dark:bg-black/30 p-4 transition " +
                  (highlightMessageId === selectedThread.id ? 'ring-2 ring-orange-400/70' : '')
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs opacity-70">{formatDateTime(selectedThread.created_at)}</div>
                    <div className="mt-1 text-sm font-semibold truncate">
                      {selectedThread.author?.name || selectedThread.author?.email || selectedThread.author_id}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {userId && selectedThread.author_id === userId && editingMessageId !== selectedThread.id && (
                      <button
                        onClick={() => startEdit(selectedThread)}
                        className={pillBtnSm}
                      >
                        Bewerk
                      </button>
                    )}
                  </div>
                </div>

                {editingMessageId === selectedThread.id ? (
                  <>
                    <textarea
                      value={editingDraft}
                      onChange={(e) => setEditingDraft(e.target.value)}
                      rows={6}
                      className="mt-3 w-full rounded border px-3 py-2 bg-transparent"
                      placeholder="Bewerk je bericht…"
                    />
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        onClick={() => saveEdit(selectedThread.id)}
                        disabled={savingEditId === selectedThread.id || !editingDraft.trim()}
                        className={pillBtnPrimary}
                      >
                        {savingEditId === selectedThread.id ? 'Opslaan…' : 'Opslaan'}
                      </button>
                      <button
                        onClick={cancelEdit}
                        className={pillBtn}
                      >
                        Annuleer
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="mt-3 text-sm whitespace-pre-wrap">{selectedThread.body}</div>
                )}
              </div>

              <div className="mt-4">
                <div className="font-semibold mb-2">Reacties</div>
                <div className="space-y-2">
                  {(selectedThreadReplies ?? []).length === 0 ? (
                    <div className="text-sm opacity-70">Nog geen reacties.</div>
                  ) : (
                    (() => {
                      const renderReply = (r: IntranetMessage, depth: number) => {
                        const replyAuthor = r.author?.name || r.author?.email || r.author_id
                        const children = repliesNested.byParent.get(r.id) ?? []
                        const pad = Math.min(depth, 6) * 12
                        const isEditing = editingMessageId === r.id

                        return (
                          <div key={r.id} style={{ marginLeft: pad }} className="space-y-2">
                            <div
                              id={`msg-${r.id}`}
                              className={
                                "rounded border border-orange-200/60 dark:border-orange-500/30 bg-white/70 dark:bg-black/20 p-3 transition " +
                                (highlightMessageId === r.id ? 'ring-2 ring-orange-400/70' : '')
                              }
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-xs opacity-80">{formatDateTime(r.created_at)}</div>
                                  <div className="text-sm font-semibold truncate">{replyAuthor}</div>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                  {userId && !isEditing && (
                                    <button
                                      onClick={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        setReplyingTo(r.id)
                                        setTimeout(() => replyTextareaRef.current?.focus(), 0)
                                      }}
                                      className={pillBtnSm}
                                    >
                                      Reageer
                                    </button>
                                  )}
                                  {userId && r.author_id === userId && !isEditing && (
                                    <button
                                      onClick={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        startEdit(r)
                                      }}
                                      className={pillBtnSm}
                                    >
                                      Bewerk
                                    </button>
                                  )}
                                  {isAdmin && (
                                    <button
                                      onClick={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        deleteMessage(r.id)
                                      }}
                                      className="text-xs text-red-600 hover:text-red-800"
                                    >
                                      Verwijder
                                    </button>
                                  )}
                                </div>
                              </div>

                              {isEditing ? (
                                <>
                                  <textarea
                                    value={editingDraft}
                                    onChange={(e) => setEditingDraft(e.target.value)}
                                    rows={4}
                                    className="mt-2 w-full rounded border px-3 py-2 bg-transparent"
                                    placeholder="Bewerk je reactie…"
                                  />
                                  <div className="mt-2 flex items-center gap-2">
                                    <button
                                      onClick={() => saveEdit(r.id)}
                                      disabled={savingEditId === r.id || !editingDraft.trim()}
                                      className={pillBtnPrimary}
                                    >
                                      {savingEditId === r.id ? 'Opslaan…' : 'Opslaan'}
                                    </button>
                                    <button
                                      onClick={cancelEdit}
                                      className={pillBtn}
                                    >
                                      Annuleer
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <div className="mt-2 text-sm whitespace-pre-wrap">{r.body}</div>
                              )}
                            </div>

                            {children.length > 0 && (
                              <div className="space-y-2 pl-3 border-l border-orange-200/60 dark:border-orange-500/30">
                                {children.map((c) => renderReply(c, depth + 1))}
                              </div>
                            )}
                          </div>
                        )
                      }

                      return (
                        <div className="space-y-2">
                          {repliesNested.roots.map((r) => renderReply(r, 0))}
                        </div>
                      )
                    })()
                  )}
                </div>
              </div>

              <div className="mt-4 rounded border border-orange-200/60 dark:border-orange-500/30 bg-white dark:bg-black/30 p-3">
                {userId ? (
                  <>
                    {replyingToMessage && selectedThread && replyingToMessage.id !== selectedThread.id && (
                      <div className="mb-2 flex items-center justify-between gap-2 rounded border border-orange-200/60 dark:border-orange-500/30 bg-white/60 dark:bg-black/20 px-3 py-2">
                        <div className="text-xs opacity-80 truncate">
                          Reageer op:{' '}
                          <button
                            type="button"
                            onClick={() => scrollToMessage(replyingToMessage.id)}
                            className="font-semibold underline underline-offset-2 hover:opacity-90"
                          >
                            {replyingToMessage.author?.name || replyingToMessage.author?.email || replyingToMessage.author_id}
                          </button>
                        </div>
                        <button
                          onClick={() => setReplyingTo(null)}
                          className={pillBtnSm}
                        >
                          Annuleer
                        </button>
                      </div>
                    )}
                    <textarea
                      ref={replyTextareaRef}
                      value={replyDrafts[selectedThread.id] ?? ''}
                      onChange={(e) =>
                        setReplyDrafts((prev) => ({
                          ...prev,
                          [selectedThread.id]: e.target.value,
                        }))
                      }
                      rows={2}
                      className="w-full rounded border px-3 py-2 bg-transparent"
                      placeholder={
                        replyingToMessage && selectedThread && replyingToMessage.id !== selectedThread.id
                          ? 'Schrijf een reactie op deze reactie…'
                          : 'Schrijf een reactie…'
                      }
                    />
                    <div className="mt-2 flex items-center gap-3">
                      <button
                        onClick={() => sendReply(selectedThread.id)}
                        disabled={sendingReplyId === selectedThread.id || !(replyDrafts[selectedThread.id] ?? '').trim()}
                        className={pillBtnPrimary}
                      >
                        {sendingReplyId === selectedThread.id ? 'Versturen…' : 'Verstuur'}
                      </button>
                      <button
                        onClick={() => setSelectedThreadId(null)}
                        className={pillBtn}
                      >
                        Sluit thread
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-sm opacity-70">Log in om te reageren.</div>
                )}
              </div>
            </>
          )}
        </div>
      </main>

      {/* Right panel */}
      <aside className="w-[420px] border-l border-orange-200/60 dark:border-orange-500/30 hidden lg:flex flex-col min-w-0">
        <div className="p-3 border-b border-orange-200/60 dark:border-orange-500/30 flex items-center justify-between gap-2">
          <div className="font-bold truncate">Leden</div>
          <div className="flex items-center gap-2">
            {isAdmin && activeChannel && (
              <button
                onClick={() => {
                  setMembersOpen(true)
                  loadMembers()
                  loadProfilesAlphabetical()
                }}
                className={pillBtn}
              >
                Beheren
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3">
          {!activeChannelId ? (
            <div className="text-sm opacity-70">Selecteer eerst een kanaal.</div>
          ) : !userId ? (
            <div className="text-sm opacity-70">Log in om leden te zien.</div>
          ) : channelMembersLoading && channelMembers.length === 0 ? (
            <div className="text-sm opacity-70">Laden…</div>
          ) : channelMembers.length === 0 ? (
            <div className="text-sm opacity-70">Geen leden (of geen toegang).</div>
          ) : (
            <div className="space-y-2">
              <div className="text-xs opacity-70">{channelMembers.length} leden</div>
              {channelMembers.map((m) => {
                const label = m.name || m.email || m.member_id
                return (
                  <div
                    key={m.member_id}
                    className="rounded border border-orange-200/60 dark:border-orange-500/30 bg-white/70 dark:bg-black/20 p-2"
                  >
                    <div className="text-sm font-semibold truncate">{label}</div>
                    {m.email && m.name && <div className="text-xs opacity-70 truncate">{m.email}</div>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </aside>

      {/* Mobile drawer: channels + threads */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileNavOpen(false)} />
          <div className="absolute left-0 top-0 h-[100dvh] w-[92vw] max-w-sm bg-white dark:bg-gray-900 border-r border-orange-200/60 dark:border-orange-500/30 shadow-xl flex flex-col">
            <div className="p-3 border-b border-orange-200/60 dark:border-orange-500/30 flex items-center justify-between gap-2">
              <div className="font-bold truncate">Intranet</div>
              <button
                onClick={() => setMobileNavOpen(false)}
                className={pillBtn}
              >
                Sluiten
              </button>
            </div>

            <div className="flex-1 overflow-auto">
              <div className="p-2">
                <div className="text-xs font-semibold opacity-70 px-2 mb-1">Kanalen</div>
                {channels.length === 0 ? (
                  <div className="text-sm opacity-70 p-2">Geen kanalen (of geen toegang).</div>
                ) : (
                  <div className="space-y-1">
                    {channels.map((c) => {
                      const active = c.id === activeChannelId
                      return (
                        <button
                          key={c.id}
                          onClick={() => {
                            setActiveChannelId(c.id)
                            setSelectedThreadId(null)
                            setMobileNavOpen(false)
                          }}
                          className={
                            'w-full text-left px-3 py-2 rounded border ' +
                            (active
                              ? 'bg-orange-100 dark:bg-orange-500/10 border-orange-300/60 dark:border-orange-500/30'
                              : 'border-transparent hover:bg-orange-50 dark:hover:bg-white/5')
                          }
                          title={c.description ?? undefined}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="truncate">#{c.name}</div>
                            {c.is_private && <span className="text-[10px] opacity-70">privé</span>}
                          </div>
                          {c.description && <div className="text-xs opacity-70 truncate">{c.description}</div>}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="px-3 py-2 border-t border-orange-200/60 dark:border-orange-500/30 flex items-center justify-between gap-2">
                <div className="font-semibold text-sm truncate">Threads</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (!canStartThread) return
                      setNewPost('')
                      setNewThreadOpen(true)
                    }}
                    disabled={!canStartThread}
                    className={pillBtnIcon + ' disabled:opacity-50'}
                    title={!activeChannelId ? 'Selecteer eerst een kanaal' : !userId ? 'Log in om een thread te starten' : 'Nieuwe thread'}
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="p-2">
                {!activeChannelId ? (
                  <div className="text-sm opacity-70 p-2">Selecteer eerst een kanaal.</div>
                ) : loading && posts.length === 0 ? (
                  <div className="text-sm opacity-70 p-2">Laden…</div>
                ) : posts.length === 0 ? (
                  <div className="text-sm opacity-70 p-2">Nog geen threads.</div>
                ) : (
                  <div className="space-y-1">
                    {posts.map((t) => {
                      const selected = t.id === selectedThreadId
                      const replies = repliesByParent[t.id] ?? []
                      const preview = String(t.body ?? '').split('\n')[0] || '(leeg)'
                      const authorLabel = t.author?.name || t.author?.email || t.author_id
                      return (
                        <div
                          key={t.id}
                          className={
                            'w-full rounded border flex items-stretch gap-1 ' +
                            (selected
                              ? 'bg-orange-100 dark:bg-orange-500/10 border-orange-300/60 dark:border-orange-500/30'
                              : 'border-transparent hover:bg-orange-50 dark:hover:bg-white/5')
                          }
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedThreadId(t.id)
                              setReplyingTo(null)
                              setMobileNavOpen(false)
                            }}
                            className="flex-1 min-w-0 text-left px-3 py-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-xs opacity-70 truncate">{authorLabel}</div>
                              <div className="text-[10px] opacity-60 shrink-0">{replies.length}</div>
                            </div>
                            <div className="text-sm font-semibold truncate">{preview}</div>
                            <div className="text-[10px] opacity-60 truncate">{formatDateTime(t.created_at)}</div>
                          </button>

                          {isAdmin && (
                            <button
                              type="button"
                              onClick={async (e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                await deleteMessage(t.id)
                                setReplyingTo(null)
                                setSelectedThreadId((prev) => (prev === t.id ? null : prev))
                              }}
                              className="px-2 text-xs opacity-70 hover:opacity-100 hover:text-red-700"
                              title="Thread verwijderen"
                              aria-label="Thread verwijderen"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Channel modal */}
      {channelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setChannelModalOpen(false)} />
          <div className="relative w-full max-w-md rounded border border-orange-200/60 dark:border-orange-500/30 bg-white dark:bg-gray-900 shadow-xl">
            <div className="p-4 border-b border-orange-200/60 dark:border-orange-500/30 flex items-center justify-between">
              <div className="font-bold">
                {channelModalMode === 'create' ? 'Kanaal maken' : 'Kanaal bewerken'}
              </div>
              <button
                onClick={() => setChannelModalOpen(false)}
                className={pillBtn}
              >
                Sluiten
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-sm mb-1">Naam</label>
                <input
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  className="w-full bg-transparent border rounded px-2 py-1"
                  placeholder="bijv. project-alpha"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Omschrijving (optioneel)</label>
                <input
                  value={channelDesc}
                  onChange={(e) => setChannelDesc(e.target.value)}
                  className="w-full bg-transparent border rounded px-2 py-1"
                  placeholder="Korte omschrijving"
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={channelPrivate} onChange={(e) => setChannelPrivate(e.target.checked)} />
                Privé (alleen leden)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={channelAnnouncementsOnly}
                  onChange={(e) => setChannelAnnouncementsOnly(e.target.checked)}
                />
                Alleen aankondigingen (admin start topics)
              </label>

              <div className="flex items-center gap-2">
                <button
                  onClick={saveChannel}
                  disabled={channelSaving || !channelName.trim()}
                  className={'flex-1 ' + pillBtnPrimary}
                >
                  {channelSaving ? 'Opslaan…' : 'Opslaan'}
                </button>
                {channelModalMode === 'edit' && (
                  <button
                    onClick={deleteChannel}
                    className={pillBtnDanger}
                  >
                    Verwijderen
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New thread modal */}
      {newThreadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              setNewThreadOpen(false)
              setNewPost('')
            }}
          />
          <div className="relative w-full max-w-2xl rounded border border-orange-200/60 dark:border-orange-500/30 bg-white dark:bg-gray-900 shadow-xl">
            <div className="p-4 border-b border-orange-200/60 dark:border-orange-500/30 flex items-center justify-between gap-3">
              <div className="font-bold truncate">Nieuw topic {activeChannel ? `(#${activeChannel.name})` : ''}</div>
              <button
                onClick={() => {
                  setNewThreadOpen(false)
                  setNewPost('')
                }}
                className={pillBtn}
              >
                Sluiten
              </button>
            </div>
            <div className="p-4 space-y-3">
              {!canStartThread ? (
                <div className="text-sm text-red-700 dark:text-red-300">
                  Je mag in dit kanaal geen nieuwe threads starten.
                </div>
              ) : (
                <>
                  <textarea
                    value={newPost}
                    onChange={(e) => setNewPost(e.target.value)}
                    rows={6}
                    className="w-full rounded border px-3 py-2 bg-transparent"
                    placeholder={activeChannel?.announcements_only ? 'Schrijf een update…' : 'Schrijf een bericht…'}
                  />
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs opacity-70">Tip: de eerste regel wordt gebruikt als preview.</div>
                    <button
                      onClick={async () => {
                        const ok = await postAnnouncement()
                        if (ok) setNewThreadOpen(false)
                      }}
                      disabled={posting || !newPost.trim()}
                      className={pillBtnPrimary}
                    >
                      {posting ? 'Plaatsen…' : 'Plaatsen'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Members modal */}
      {membersOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMembersOpen(false)} />
          <div className="relative w-full max-w-2xl rounded border border-orange-200/60 dark:border-orange-500/30 bg-white dark:bg-gray-900 shadow-xl">
            <div className="p-4 border-b border-orange-200/60 dark:border-orange-500/30 flex items-center justify-between gap-3">
              <div className="font-bold truncate">Leden beheren {activeChannel ? `(#${activeChannel.name})` : ''}</div>
              <button
                onClick={() => setMembersOpen(false)}
                className={pillBtn}
              >
                Sluiten
              </button>
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="font-semibold mb-2">Huidige leden</div>
                {membersLoading ? (
                  <div className="text-sm opacity-70">Laden…</div>
                ) : members.length === 0 ? (
                  <div className="text-sm opacity-70">Geen leden.</div>
                ) : (
                  <div className="space-y-2">
                    {members.map((m) => {
                      const label = m.profile?.name || m.profile?.email || m.member_id
                      const disabled = Boolean(m.profile?.deleted_at)
                      return (
                        <div key={m.member_id} className="rounded border border-orange-200/60 dark:border-orange-500/30 p-2 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold truncate">{label}</div>
                            {m.profile?.email && <div className="text-xs opacity-70 truncate">{m.profile.email}</div>}
                            {disabled && <div className="text-xs text-red-600">(verwijderd account)</div>}
                          </div>
                          <button
                            onClick={() => setMember(m.member_id, false)}
                            disabled={memberMutating === m.member_id}
                            className={pillBtnDanger}
                          >
                            Verwijder
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div>
                <div className="font-semibold mb-2">Toevoegen (alfabetisch)</div>

                <div className="text-xs opacity-70">
                  Lijst wordt automatisch geladen zodra je dit scherm opent.
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <select
                    value={profilePickId}
                    onChange={(e) => setProfilePickId(e.target.value)}
                    className="flex-1 rounded border px-3 py-2 bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100 border-orange-200/60 dark:border-orange-500/30"
                    disabled={profilesLoading}
                  >
                    <option value="" className="bg-white text-gray-500 dark:bg-gray-950 dark:text-gray-400">
                      Kies een medewerker…
                    </option>
                    {availableProfiles.map((p) => {
                      const label = p.name || p.email || p.id
                      return (
                        <option key={p.id} value={p.id}>
                          {label}{p.email && p.name ? ` (${p.email})` : ''}
                        </option>
                      )
                    })}
                  </select>
                  <button
                    onClick={async () => {
                      if (!profilePickId) return
                      await setMember(profilePickId, true)
                      setProfilePickId('')
                    }}
                    disabled={!profilePickId || memberMutating === profilePickId}
                    className={pillBtnSuccess}
                  >
                    {memberMutating === profilePickId ? 'Toevoegen…' : 'Toevoegen'}
                  </button>
                </div>

                <div className="mt-2 text-xs opacity-70">
                  Tip: bij een privé kanaal moet je iedereen hier toevoegen.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
