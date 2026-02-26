'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAdminGuard } from '@/lib/useAdminGuard'

type Target = {
  id: string
  name: string | null
  email: string | null
  role: string
}

type TargetGroup = {
  id: string
  name: string
  user_ids: string[]
}

type ScheduleRow = {
  id: string
  name: string | null
  enabled: boolean
  title: string
  body: string
  url: string
  target_all: boolean
  target_user_ids: string[] | null
  target_group_ids?: string[] | null
  repeat_minutes: number | null
  repeat_weeks?: number | null
  repeat_months?: number | null
  next_run_at: string
  last_run_at: string | null
  created_at: string
  updated_at: string
}

const fmt = (iso: string | null) => {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleString('nl-NL', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function AdminPushPage() {
  const { allowed } = useAdminGuard()

  const [tab, setTab] = useState<'send' | 'schedules'>('send')

  const [targets, setTargets] = useState<Target[]>([])
  const [targetsLoading, setTargetsLoading] = useState(false)

  const [groups, setGroups] = useState<TargetGroup[]>([])
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [groupBusy, setGroupBusy] = useState(false)
  const [groupMsg, setGroupMsg] = useState<string | null>(null)
  const [selectedGroupIds, setSelectedGroupIds] = useState<Record<string, boolean>>({})
  const [excludedUserIds, setExcludedUserIds] = useState<Record<string, boolean>>({})
  const [recipientSearch, setRecipientSearch] = useState('')
  const [recipientView, setRecipientView] = useState<'selected' | 'all'>('selected')
  const [groupSearch, setGroupSearch] = useState('')

  const [groupModalOpen, setGroupModalOpen] = useState(false)
  const [groupEditing, setGroupEditing] = useState<TargetGroup | null>(null)
  const [groupFormName, setGroupFormName] = useState('')
  const [groupFormSelectedUserIds, setGroupFormSelectedUserIds] = useState<Record<string, boolean>>({})
  const [groupFormSearch, setGroupFormSearch] = useState('')

  const [sendMode, setSendMode] = useState<'all' | 'users'>('all')
  const [selectedUserIds, setSelectedUserIds] = useState<Record<string, boolean>>({})
  const [sendBody, setSendBody] = useState('')
  const [sendBusy, setSendBusy] = useState(false)
  const [sendResult, setSendResult] = useState<string | null>(null)

  const [schedules, setSchedules] = useState<ScheduleRow[]>([])
  const [schedulesLoading, setSchedulesLoading] = useState(false)
  const [schedError, setSchedError] = useState<string | null>(null)

  const [editingSchedule, setEditingSchedule] = useState<ScheduleRow | null>(null)
  const [editName, setEditName] = useState('')
  const [editEnabled, setEditEnabled] = useState(true)
  const [editTarget, setEditTarget] = useState<'all' | 'users'>('all')
  const [editRepeat, setEditRepeat] = useState<string>('once')
  const [editNextRun, setEditNextRun] = useState<string>('')
  const [editBody, setEditBody] = useState('')
  const [editBusy, setEditBusy] = useState(false)
  const [editMsg, setEditMsg] = useState<string | null>(null)

  const [newName, setNewName] = useState('')
  const [newEnabled, setNewEnabled] = useState(true)
  const [newTarget, setNewTarget] = useState<'all' | 'users'>('all')
  const [newRepeat, setNewRepeat] = useState<string>('m:60')
  const [newNextRun, setNewNextRun] = useState<string>('')
  const [newBody, setNewBody] = useState('')
  const [newBusy, setNewBusy] = useState(false)
  const [newMsg, setNewMsg] = useState<string | null>(null)

  const selectedIds = useMemo(
    () => Object.entries(selectedUserIds).filter(([, v]) => v).map(([k]) => k),
    [selectedUserIds]
  )

  const selectedGroupIdList = useMemo(
    () => Object.entries(selectedGroupIds).filter(([, v]) => v).map(([k]) => k),
    [selectedGroupIds]
  )

  const excludedIdList = useMemo(
    () => Object.entries(excludedUserIds).filter(([, v]) => v).map(([k]) => k),
    [excludedUserIds]
  )

  const selectedGroupMemberIds = useMemo(() => {
    const picked = new Set(selectedGroupIdList)
    const ids = groups
      .filter((g) => picked.has(g.id))
      .flatMap((g) => (Array.isArray(g.user_ids) ? g.user_ids : []))
      .map(String)
      .filter(Boolean)
    return Array.from(new Set(ids))
  }, [groups, selectedGroupIdList])

  const modeForRecipients = tab === 'send' ? sendMode : (editingSchedule ? editTarget : newTarget)

  const toDatetimeLocal = (iso: string | null | undefined) => {
    if (!iso) return ''
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const recordFromIds = (ids: string[] | null | undefined) => {
    const rec: Record<string, boolean> = {}
    for (const id of Array.isArray(ids) ? ids : []) {
      const k = String(id)
      if (k) rec[k] = true
    }
    return rec
  }

  const groupFormSelectedIds = useMemo(
    () => Object.entries(groupFormSelectedUserIds).filter(([, v]) => v).map(([k]) => k),
    [groupFormSelectedUserIds]
  )

  const resolvedRecipientIds = useMemo(() => {
    let base: string[]
    if (modeForRecipients === 'all') {
      base = targets.map((t) => String(t.id)).filter(Boolean)
    } else {
      base = Array.from(new Set([...selectedIds, ...selectedGroupMemberIds]))
    }

    if (excludedIdList.length === 0) return base
    const excluded = new Set(excludedIdList)
    return base.filter((id) => !excluded.has(id))
  }, [modeForRecipients, targets, selectedIds, selectedGroupMemberIds, excludedIdList])

  const targetsById = useMemo(() => {
    const m = new Map<string, Target>()
    for (const t of targets) m.set(String(t.id), t)
    return m
  }, [targets])

  const resolvedRecipientRows = useMemo(() => {
    const q = recipientSearch.trim().toLowerCase()
    const rows = resolvedRecipientIds
      .map((id) => ({ id, t: targetsById.get(id) }))
      .map((r) => ({
        id: r.id,
        label: r.t?.name || r.t?.email || r.id,
        email: r.t?.email || null,
      }))

    if (!q) return rows
    return rows.filter((r) => (r.label + ' ' + (r.email ?? '') + ' ' + r.id).toLowerCase().includes(q))
  }, [resolvedRecipientIds, targetsById, recipientSearch])

  const resolvedRecipientSet = useMemo(() => new Set(resolvedRecipientIds), [resolvedRecipientIds])
  const selectedDirectSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const selectedGroupSet = useMemo(() => new Set(selectedGroupMemberIds), [selectedGroupMemberIds])
  const excludedSet = useMemo(() => new Set(excludedIdList), [excludedIdList])

  const allTargetRows = useMemo(() => {
    const q = recipientSearch.trim().toLowerCase()
    const rows = targets
      .map((t) => ({
        id: String(t.id),
        label: t.name || t.email || String(t.id),
        email: t.email || null,
      }))
      .filter((r) => Boolean(r.id))

    const filtered = !q
      ? rows
      : rows.filter((r) => (r.label + ' ' + (r.email ?? '') + ' ' + r.id).toLowerCase().includes(q))

    return filtered.map((r) => {
      const included = resolvedRecipientSet.has(r.id)
      const excluded = excludedSet.has(r.id)
      const sourceDirect = selectedDirectSet.has(r.id)
      const sourceGroup = selectedGroupSet.has(r.id)
      return { ...r, included, excluded, sourceDirect, sourceGroup }
    })
  }, [targets, recipientSearch, resolvedRecipientSet, excludedSet, selectedDirectSet, selectedGroupSet])

  const loadTargets = async () => {
    setTargetsLoading(true)
    try {
      const { data: sessionRes } = await supabase.auth.getSession()
      const token = sessionRes.session?.access_token
      if (!token) {
        setTargets([])
        return
      }

      const res = await fetch('/api/admin/push/targets', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'Targets laden mislukt')
      setTargets((json?.targets ?? []) as Target[])
    } finally {
      setTargetsLoading(false)
    }
  }

  const loadGroups = async () => {
    setGroupsLoading(true)
    try {
      const { data: sessionRes } = await supabase.auth.getSession()
      const token = sessionRes.session?.access_token
      if (!token) {
        setGroups([])
        return
      }

      const res = await fetch('/api/admin/push/groups', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.details || json?.error || 'Groepen laden mislukt')
      setGroups((json?.groups ?? []) as TargetGroup[])
    } finally {
      setGroupsLoading(false)
    }
  }

  const loadSchedules = async () => {
    setSchedulesLoading(true)
    setSchedError(null)
    try {
      const { data: sessionRes } = await supabase.auth.getSession()
      const token = sessionRes.session?.access_token
      if (!token) {
        setSchedules([])
        return
      }

      const res = await fetch('/api/admin/push/schedules', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.details || json?.error || 'Schedules laden mislukt')
      setSchedules((json?.schedules ?? []) as ScheduleRow[])
    } catch (e: any) {
      setSchedError(e?.message || 'Schedules laden mislukt')
      setSchedules([])
    } finally {
      setSchedulesLoading(false)
    }
  }

  useEffect(() => {
    if (allowed) {
      loadTargets()
      loadGroups()
      loadSchedules()
    }
  }, [allowed])

  const openCreateGroup = () => {
    setGroupMsg(null)
    setGroupEditing(null)
    setGroupFormName('')
    setGroupFormSelectedUserIds({})
    setGroupFormSearch('')
    setGroupModalOpen(true)
  }

  const openEditGroup = (g: TargetGroup) => {
    setGroupMsg(null)
    setGroupEditing(g)
    setGroupFormName(g.name)
    setGroupFormSelectedUserIds(recordFromIds(g.user_ids))
    setGroupFormSearch('')
    setGroupModalOpen(true)
  }

  const closeGroupModal = () => {
    setGroupModalOpen(false)
    setGroupEditing(null)
  }

  const saveGroupModal = async () => {
    setGroupMsg(null)
    setGroupBusy(true)
    try {
      const name = groupFormName.trim()
      if (!name) {
        setGroupMsg('Geef een groepsnaam op')
        return
      }
      if (groupFormSelectedIds.length === 0) {
        setGroupMsg('Selecteer minstens 1 werknemer')
        return
      }

      const { data: sessionRes } = await supabase.auth.getSession()
      const token = sessionRes.session?.access_token
      if (!token) {
        setGroupMsg('Niet ingelogd')
        return
      }

      const url = groupEditing
        ? `/api/admin/push/groups/${encodeURIComponent(groupEditing.id)}`
        : '/api/admin/push/groups'

      const res = await fetch(url, {
        method: groupEditing ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          userIds: groupFormSelectedIds,
        }),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setGroupMsg(String(json?.details || json?.error || 'Groep opslaan mislukt'))
        return
      }

      setGroupMsg(groupEditing ? 'Groep aangepast' : 'Groep opgeslagen')
      await loadGroups()
      closeGroupModal()
    } catch (e: any) {
      setGroupMsg(e?.message || 'Groep opslaan mislukt')
    } finally {
      setGroupBusy(false)
    }
  }

  const toggleRecipient = (id: string, include: boolean) => {
    const userId = String(id)
    if (!userId) return

    if (modeForRecipients === 'all') {
      setExcludedUserIds((p) => ({ ...p, [userId]: include ? false : true }))
      return
    }

    const isDirect = Boolean(selectedUserIds[userId])
    const isFromGroup = selectedGroupMemberIds.includes(userId)

    if (include) {
      // including overrides exclusion; if not included at all, add to direct selection
      setExcludedUserIds((p) => ({ ...p, [userId]: false }))
      if (!isDirect && !isFromGroup) setSelectedUserIds((p) => ({ ...p, [userId]: true }))
    } else {
      // if it is directly selected, unselect it; if it comes from group(s), exclude it
      if (isDirect) setSelectedUserIds((p) => ({ ...p, [userId]: false }))
      if (isFromGroup || !isDirect) setExcludedUserIds((p) => ({ ...p, [userId]: true }))
    }
  }

  const deleteGroup = async (g: TargetGroup) => {
    const ok = confirm(`Groep verwijderen: ${g.name}?`)
    if (!ok) return

    setGroupMsg(null)
    setGroupBusy(true)
    try {
      const { data: sessionRes } = await supabase.auth.getSession()
      const token = sessionRes.session?.access_token
      if (!token) return

      const res = await fetch(`/api/admin/push/groups/${encodeURIComponent(g.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.details || json?.error || 'Groep verwijderen mislukt'))

      setSelectedGroupIds((p) => {
        const next = { ...p }
        delete next[g.id]
        return next
      })
      setGroupMsg('Groep verwijderd')
      await loadGroups()
    } catch (e: any) {
      setGroupMsg(e?.message || 'Groep verwijderen mislukt')
    } finally {
      setGroupBusy(false)
    }
  }

  const sendNow = async () => {
    setSendResult(null)
    setSendBusy(true)
    try {
      const { data: sessionRes } = await supabase.auth.getSession()
      const token = sessionRes.session?.access_token
      if (!token) {
        setSendResult('Niet ingelogd')
        return
      }

      const res = await fetch('/api/admin/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          target: sendMode === 'all' && excludedIdList.length === 0 ? 'all' : 'users',
          userIds:
            sendMode === 'all' && excludedIdList.length === 0
              ? undefined
              : excludedIdList.length > 0
                ? resolvedRecipientIds
                : selectedIds,
          groupIds:
            sendMode === 'all' || excludedIdList.length > 0
              ? undefined
              : selectedGroupIdList,
          title: 'Vortexx',
          body: sendBody,
          url: '/',
        }),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSendResult(String(json?.details || json?.error || 'Versturen mislukt'))
        return
      }

      setSendResult(`Verstuurd: ${json.sent}/${json.totalSubscriptions} (mislukt ${json.failed}, verwijderd ${json.removed})`)
    } catch (e: any) {
      setSendResult(e?.message || 'Versturen mislukt')
    } finally {
      setSendBusy(false)
    }
  }

  const createSchedule = async () => {
    setNewMsg(null)
    setNewBusy(true)
    try {
      const { data: sessionRes } = await supabase.auth.getSession()
      const token = sessionRes.session?.access_token
      if (!token) {
        setNewMsg('Niet ingelogd')
        return
      }

      let repeatUnit: 'once' | 'minutes' | 'weeks' | 'months' = 'once'
      let repeatEvery: number | null = null

      if (newRepeat === 'once') {
        repeatUnit = 'once'
      } else if (newRepeat.startsWith('m:')) {
        repeatUnit = 'minutes'
        repeatEvery = Number(newRepeat.slice(2))
      } else if (newRepeat.startsWith('w:')) {
        repeatUnit = 'weeks'
        repeatEvery = Number(newRepeat.slice(2))
      } else if (newRepeat.startsWith('mo:')) {
        repeatUnit = 'months'
        repeatEvery = Number(newRepeat.slice(3))
      }

      const nextRunAt = newNextRun ? new Date(newNextRun).toISOString() : null

      const res = await fetch('/api/admin/push/schedules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newName || null,
          enabled: newEnabled,
          title: 'Vortexx',
          body: newBody,
          url: '/',
          target: newTarget === 'all' && excludedIdList.length === 0 ? 'all' : 'users',
          userIds:
            newTarget === 'all' && excludedIdList.length === 0
              ? undefined
              : excludedIdList.length > 0
                ? resolvedRecipientIds
                : selectedIds,
          groupIds:
            newTarget === 'all' || excludedIdList.length > 0
              ? undefined
              : selectedGroupIdList,
          repeatUnit,
          repeatEvery,
          nextRunAt,
        }),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setNewMsg(String(json?.details || json?.error || 'Aanmaken mislukt'))
        return
      }

      setNewMsg('Schedule aangemaakt')
      setNewBody('')
      setNewNextRun('')
      await loadSchedules()
    } catch (e: any) {
      setNewMsg(e?.message || 'Aanmaken mislukt')
    } finally {
      setNewBusy(false)
    }
  }

  const toggleSchedule = async (id: string, enabled: boolean) => {
    const { data: sessionRes } = await supabase.auth.getSession()
    const token = sessionRes.session?.access_token
    if (!token) return

    await fetch(`/api/admin/push/schedules/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ enabled: !enabled }),
    })

    await loadSchedules()
  }

  const deleteSchedule = async (id: string) => {
    const ok = confirm('Schedule verwijderen?')
    if (!ok) return

    const { data: sessionRes } = await supabase.auth.getSession()
    const token = sessionRes.session?.access_token
    if (!token) return

    await fetch(`/api/admin/push/schedules/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })

    await loadSchedules()
  }

  const openEditSchedule = (s: ScheduleRow) => {
    setEditMsg(null)
    setEditingSchedule(s)
    setEditName(String(s.name ?? ''))
    setEditEnabled(Boolean(s.enabled))
    setEditTarget(s.target_all ? 'all' : 'users')

    const repeat = s.repeat_minutes
      ? `m:${s.repeat_minutes}`
      : s.repeat_weeks
        ? `w:${s.repeat_weeks}`
        : s.repeat_months
          ? `mo:${s.repeat_months}`
          : 'once'
    setEditRepeat(repeat)

    setEditNextRun(toDatetimeLocal(s.next_run_at))
    setEditBody(String(s.body ?? ''))

    setSelectedUserIds(recordFromIds(s.target_user_ids))
    setSelectedGroupIds(recordFromIds((s as any).target_group_ids))
    setExcludedUserIds({})
    setRecipientView('selected')
  }

  const closeEditSchedule = () => {
    setEditingSchedule(null)
    setEditMsg(null)
    setEditBusy(false)
  }

  const saveScheduleEdits = async () => {
    if (!editingSchedule) return
    setEditMsg(null)
    setEditBusy(true)
    try {
      const { data: sessionRes } = await supabase.auth.getSession()
      const token = sessionRes.session?.access_token
      if (!token) {
        setEditMsg('Niet ingelogd')
        return
      }

      let repeatUnit: 'once' | 'minutes' | 'weeks' | 'months' = 'once'
      let repeatEvery: number | null = null

      if (editRepeat === 'once') {
        repeatUnit = 'once'
      } else if (editRepeat.startsWith('m:')) {
        repeatUnit = 'minutes'
        repeatEvery = Number(editRepeat.slice(2))
      } else if (editRepeat.startsWith('w:')) {
        repeatUnit = 'weeks'
        repeatEvery = Number(editRepeat.slice(2))
      } else if (editRepeat.startsWith('mo:')) {
        repeatUnit = 'months'
        repeatEvery = Number(editRepeat.slice(3))
      }

      const nextRunAt = editNextRun ? new Date(editNextRun).toISOString() : undefined

      const payload: any = {
        name: editName.trim() ? editName.trim() : null,
        enabled: editEnabled,
        title: 'Vortexx',
        url: '/',
        body: editBody,
        repeatUnit,
        repeatEvery,
        nextRunAt,
      }

      if (editTarget === 'all' && excludedIdList.length === 0) {
        payload.target = 'all'
        payload.userIds = undefined
        payload.groupIds = undefined
      } else {
        payload.target = 'users'
        if (excludedIdList.length > 0 || editTarget === 'all') {
          payload.userIds = resolvedRecipientIds
          payload.groupIds = []
        } else {
          payload.userIds = selectedIds
          payload.groupIds = selectedGroupIdList
        }
      }

      const res = await fetch(`/api/admin/push/schedules/${encodeURIComponent(editingSchedule.id)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.details || json?.error || 'Schedule bijwerken mislukt'))

      setEditMsg('Opgeslagen')
      await loadSchedules()
      closeEditSchedule()
    } catch (e: any) {
      setEditMsg(e?.message || 'Schedule bijwerken mislukt')
    } finally {
      setEditBusy(false)
    }
  }

  if (allowed === null) return <main className="px-4 py-4 sm:p-6"><p>Controleren…</p></main>
  if (!allowed) return <main className="px-4 py-4 sm:p-6"><p>Geen toegang</p></main>

  return (
    <main className="px-4 py-4 sm:p-6 space-y-5 md:max-w-5xl md:mx-auto">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <h1 className="text-2xl font-bold">Push meldingen</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setTab('send')}
            className={
              'px-3 py-2 rounded border ' +
              (tab === 'send'
                ? 'bg-black text-white border-black/70'
                : 'border-orange-500/60 hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10')
            }
          >
            Nu versturen
          </button>
          <button
            onClick={() => setTab('schedules')}
            className={
              'px-3 py-2 rounded border ' +
              (tab === 'schedules'
                ? 'bg-black text-white border-black/70'
                : 'border-orange-500/60 hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10')
            }
          >
            Herhalend
          </button>
        </div>
      </div>

      <section className="rounded-lg border border-orange-200/60 dark:border-orange-500/30 bg-white/60 dark:bg-gray-900/40 p-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="text-sm text-gray-700 dark:text-gray-200">
            Werknemers: {targetsLoading ? 'laden…' : String(targets.length)} · Groepen: {groupsLoading ? 'laden…' : String(groups.length)}
          </div>
          <button
            onClick={() => {
              loadTargets()
              loadGroups()
            }}
            className="px-3 py-2 rounded border border-orange-500/60 hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10"
          >
            Vernieuwen
          </button>
        </div>

        <div className="grid lg:grid-cols-3 gap-3">
          <div className="rounded border border-black/10 bg-white/50 dark:bg-gray-900/30 p-3 space-y-2 lg:col-span-1">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold text-sm">Groepen</div>
              <div className="flex items-center gap-2">
                <input
                  value={groupSearch}
                  onChange={(e) => setGroupSearch(e.target.value)}
                  placeholder="Zoek…"
                  className="px-2 py-1 rounded border border-black/15 bg-white/70 dark:bg-gray-900/40 text-sm w-28"
                />
                <button
                  onClick={openCreateGroup}
                  className="px-2 py-1 rounded border border-black/15 bg-white/70 hover:bg-white/90 text-sm dark:bg-white/5"
                  title="Nieuwe groep maken"
                >
                  +
                </button>
              </div>
            </div>

            <div className="pt-1">
              {groups.length === 0 ? (
                <div className="text-sm text-gray-600 dark:text-gray-300">Nog geen groepen.</div>
              ) : (
                <div className="max-h-56 overflow-auto rounded border border-black/10 bg-white/60 dark:bg-gray-950/20">
                  {groups
                    .filter((g) => {
                      const q = groupSearch.trim().toLowerCase()
                      if (!q) return true
                      return (g.name + ' ' + g.id).toLowerCase().includes(q)
                    })
                    .map((g) => (
                      <div key={g.id} className="flex items-center justify-between gap-2 px-2 py-2 border-b last:border-b-0 border-black/5 dark:border-white/5">
                        <label className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={Boolean(selectedGroupIds[g.id])}
                            onChange={(e) => setSelectedGroupIds((p) => ({ ...p, [g.id]: e.target.checked }))}
                          />
                          <span className="text-sm truncate" title={`${g.name} (${(g.user_ids ?? []).length})`}>{g.name}</span>
                        </label>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => openEditGroup(g)}
                            disabled={groupBusy}
                            className="p-1 rounded border border-black/10 bg-white/70 hover:bg-white/90 text-gray-800 disabled:opacity-50 dark:bg-white/5 dark:text-gray-100"
                            title="Aanpassen"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25Z" stroke="currentColor" strokeWidth="1.8" />
                              <path d="M14.06 6.19l3.75 3.75 1.69-1.69a1.5 1.5 0 0 0 0-2.12l-1.63-1.63a1.5 1.5 0 0 0-2.12 0l-1.69 1.69Z" stroke="currentColor" strokeWidth="1.8" />
                            </svg>
                          </button>
                          <button
                            onClick={() => deleteGroup(g)}
                            disabled={groupBusy}
                            className="p-1 rounded border border-red-400/30 bg-white/70 hover:bg-red-50 text-red-700 disabled:opacity-50 dark:bg-white/5 dark:text-red-200"
                            title="Verwijderen"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M6 7h12" stroke="currentColor" strokeWidth="1.8" />
                              <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" stroke="currentColor" strokeWidth="1.8" />
                              <path d="M8 7l1 14h6l1-14" stroke="currentColor" strokeWidth="1.8" />
                              <path d="M10 11v6" stroke="currentColor" strokeWidth="1.8" />
                              <path d="M14 11v6" stroke="currentColor" strokeWidth="1.8" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {groupMsg ? <div className="pt-2 border-t border-black/10 text-sm text-gray-800 dark:text-gray-200">{groupMsg}</div> : null}
          </div>

          <div className="rounded border border-black/10 bg-white/50 dark:bg-gray-900/30 p-3 space-y-2 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="font-semibold text-sm">Ontvangers</div>
                <div className="inline-flex rounded border border-black/10 overflow-hidden">
                  <button
                    onClick={() => setRecipientView('selected')}
                    className={
                      'px-2 py-1 text-xs ' +
                      (recipientView === 'selected' ? 'bg-black text-white' : 'bg-white/70 hover:bg-white/90 dark:bg-white/5')
                    }
                    title="Laat alleen geselecteerden zien"
                  >
                    Geselecteerd
                  </button>
                  <button
                    onClick={() => setRecipientView('all')}
                    className={
                      'px-2 py-1 text-xs border-l border-black/10 ' +
                      (recipientView === 'all' ? 'bg-black text-white' : 'bg-white/70 hover:bg-white/90 dark:bg-white/5')
                    }
                    title="Kies uit alle werknemers"
                  >
                    Alle werknemers
                  </button>
                </div>
              </div>
              <div className="flex gap-2 items-center">
                <input
                  value={recipientSearch}
                  onChange={(e) => setRecipientSearch(e.target.value)}
                  placeholder="Zoek ontvanger…"
                  className="px-3 py-2 rounded border border-black/15 bg-white/70 dark:bg-gray-900/40 text-sm"
                />
                <button
                  onClick={() => setExcludedUserIds({})}
                  className="px-3 py-2 rounded border border-black/15 bg-white/70 hover:bg-white/90 text-sm"
                  title="Verwijder alle uitzonderingen"
                >
                  Reset
                </button>
              </div>
            </div>

            <div className="text-xs text-gray-600 dark:text-gray-300">
              Modus: {modeForRecipients === 'all' ? 'Iedereen' : 'Geselecteerd'} · Ontvangers: {resolvedRecipientIds.length}
              {excludedIdList.length > 0 ? ` · Uitzonderingen: ${excludedIdList.length}` : ''}
            </div>

            <div className="max-h-72 overflow-auto rounded border border-black/10 bg-white/60 dark:bg-gray-950/20 p-2">
              {recipientView === 'selected' ? (
                resolvedRecipientRows.length === 0 ? (
                  <div className="text-sm text-gray-600 dark:text-gray-300">Geen ontvangers.</div>
                ) : (
                  <div className="space-y-1">
                    {resolvedRecipientRows.map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-2 px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/5">
                        <div className="min-w-0">
                          <div className="text-sm truncate">{r.label}</div>
                          {r.email ? <div className="text-xs text-gray-500 truncate">{r.email}</div> : null}
                        </div>
                        <button
                          onClick={() => toggleRecipient(r.id, false)}
                          className="px-2 py-1 rounded border border-red-400/40 text-red-700 bg-white/70 hover:bg-red-50 text-xs dark:bg-white/5 dark:text-red-200"
                          title="Deselecteer"
                        >
                          Deselecteer
                        </button>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                allTargetRows.length === 0 ? (
                  <div className="text-sm text-gray-600 dark:text-gray-300">Geen werknemers.</div>
                ) : (
                  <div className="space-y-1">
                    {allTargetRows.map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-2 px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/5">
                        <div className="min-w-0">
                          <div className="text-sm truncate flex items-center gap-2">
                            <span className="truncate">{r.label}</span>
                            {r.excluded ? (
                              <span className="text-[11px] px-1.5 py-0.5 rounded border border-red-400/40 text-red-700 dark:text-red-200">uitgesloten</span>
                            ) : r.included ? (
                              <span className="text-[11px] px-1.5 py-0.5 rounded border border-green-500/30 text-green-700 dark:text-green-200">geselecteerd</span>
                            ) : null}
                            {modeForRecipients === 'users' && r.included && r.sourceGroup && !r.sourceDirect ? (
                              <span className="text-[11px] px-1.5 py-0.5 rounded border border-black/10 text-gray-600 dark:text-gray-300">via groep</span>
                            ) : null}
                          </div>
                          {r.email ? <div className="text-xs text-gray-500 truncate">{r.email}</div> : null}
                        </div>
                        {r.included ? (
                          <button
                            onClick={() => toggleRecipient(r.id, false)}
                            className="px-2 py-1 rounded border border-red-400/40 text-red-700 bg-white/70 hover:bg-red-50 text-xs dark:bg-white/5 dark:text-red-200"
                            title="Deselecteer"
                          >
                            Deselecteer
                          </button>
                        ) : (
                          <button
                            onClick={() => toggleRecipient(r.id, true)}
                            className="px-2 py-1 rounded border border-black/15 bg-white/70 hover:bg-white/90 text-xs dark:bg-white/5"
                            title="Selecteer"
                          >
                            Selecteer
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>

            {excludedIdList.length > 0 && (
              <div className="text-xs text-gray-600 dark:text-gray-300">
                Tip: als iemand via een groep is toegevoegd, kun je die persoon hier deselecteren zonder de groep aan te passen.
              </div>
            )}
          </div>
        </div>

        {tab === 'send' ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              <label className="text-sm">Doelgroep</label>
              <select
                value={sendMode}
                onChange={(e) => setSendMode(e.target.value === 'users' ? 'users' : 'all')}
                className="px-3 py-2 rounded border border-black/15 bg-white/70 dark:bg-gray-900/40"
              >
                <option value="all">Iedereen</option>
                <option value="users">Geselecteerde werknemers</option>
              </select>
            </div>

            {sendMode === 'users' ? (
              <div className="text-xs text-gray-600 dark:text-gray-300">
                Tip: gebruik het “Ontvangers” paneel hierboven om werknemers te selecteren (en evt. uitzonderingen te maken).
              </div>
            ) : null}

            <div className="grid sm:grid-cols-2 gap-2">
              <div className="text-xs text-gray-600 dark:text-gray-300">
                Titel is altijd <span className="font-semibold">Vortexx</span>. Klikken opent de app.
              </div>
            </div>
            <textarea
              value={sendBody}
              onChange={(e) => setSendBody(e.target.value)}
              placeholder="Bericht"
              rows={3}
              className="w-full px-3 py-2 rounded border border-black/15 bg-white/70 dark:bg-gray-900/40"
            />

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={sendNow}
                disabled={sendBusy || !sendBody.trim()}
                className="px-3 py-2 rounded border border-orange-500/60 hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10 disabled:opacity-50"
              >
                {sendBusy ? 'Versturen…' : 'Stuur push'}
              </button>
              {sendResult ? <span className="text-sm text-gray-800 dark:text-gray-200">{sendResult}</span> : null}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <h2 className="text-lg font-semibold">Nieuwe schedule</h2>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Naam (optioneel)"
                  className="w-full px-3 py-2 rounded border border-black/15 bg-white/70 dark:bg-gray-900/40"
                />
                <div className="flex flex-wrap gap-2 items-center">
                  <label className="text-sm">Herhaling</label>
                  <select
                    value={newRepeat}
                    onChange={(e) => setNewRepeat(e.target.value)}
                    className="px-3 py-2 rounded border border-black/15 bg-white/70 dark:bg-gray-900/40"
                  >
                    <option value="once">Eenmalig</option>
                    <option value="m:15">Elke 15 min</option>
                    <option value="m:30">Elke 30 min</option>
                    <option value="m:60">Elk uur</option>
                    <option value="m:1440">Elke dag</option>
                    <option value="w:1">Elke week</option>
                    <option value="mo:1">Elke maand</option>
                  </select>

                  <label className="text-sm ml-2">Doelgroep</label>
                  <select
                    value={newTarget}
                    onChange={(e) => setNewTarget(e.target.value === 'users' ? 'users' : 'all')}
                    className="px-3 py-2 rounded border border-black/15 bg-white/70 dark:bg-gray-900/40"
                  >
                    <option value="all">Iedereen</option>
                    <option value="users">Geselecteerd</option>
                  </select>

                  <label className="text-sm ml-2">Actief</label>
                  <input type="checkbox" checked={newEnabled} onChange={(e) => setNewEnabled(e.target.checked)} />
                </div>

                <label className="text-sm text-gray-700 dark:text-gray-200">Eerste run (optioneel)</label>
                <input
                  type="datetime-local"
                  value={newNextRun}
                  onChange={(e) => setNewNextRun(e.target.value)}
                  className="px-3 py-2 rounded border border-black/15 bg-white/70 dark:bg-gray-900/40"
                />

                <div className="grid sm:grid-cols-2 gap-2">
                      <div className="text-xs text-gray-600 dark:text-gray-300">
                        Titel is altijd <span className="font-semibold">Vortexx</span>. Klikken opent de app.
                      </div>
                </div>

                <textarea
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  placeholder="Bericht"
                  rows={3}
                  className="w-full px-3 py-2 rounded border border-black/15 bg-white/70 dark:bg-gray-900/40"
                />

                <button
                  onClick={createSchedule}
                  disabled={newBusy || !newBody.trim()}
                  className="px-3 py-2 rounded border border-orange-500/60 hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10 disabled:opacity-50"
                >
                  {newBusy ? 'Aanmaken…' : 'Schedule opslaan'}
                </button>
                {newMsg ? <div className="text-sm text-gray-800 dark:text-gray-200">{newMsg}</div> : null}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Bestaande schedules</h2>
                  <button
                    onClick={loadSchedules}
                    className="px-3 py-2 rounded border border-orange-500/60 hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10"
                  >
                    Vernieuwen
                  </button>
                </div>

                {schedError ? <div className="text-sm text-red-600">{schedError}</div> : null}

                {schedulesLoading ? (
                  <p>Laden…</p>
                ) : schedules.length === 0 ? (
                  <p className="text-sm text-gray-600 dark:text-gray-300">Nog geen schedules.</p>
                ) : (
                  <div className="space-y-2">
                    {schedules.map((s) => (
                      <div key={s.id} className="rounded border border-black/10 bg-white/50 dark:bg-gray-900/30 p-3">
                        <div className="flex flex-wrap items-center gap-2 justify-between">
                          <div className="font-semibold text-sm">
                            {s.name || s.title}
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => openEditSchedule(s)}
                              className="px-2 py-1 rounded border border-black/15 bg-white/60 hover:bg-white/80 text-sm"
                            >
                              Wijzig
                            </button>
                            <button
                              onClick={() => toggleSchedule(s.id, s.enabled)}
                              className="px-2 py-1 rounded border border-black/15 bg-white/60 hover:bg-white/80 text-sm"
                            >
                              {s.enabled ? 'Pauzeer' : 'Activeer'}
                            </button>
                            <button
                              onClick={() => deleteSchedule(s.id)}
                              className="px-2 py-1 rounded border border-black/15 bg-white/60 hover:bg-white/80 text-sm"
                            >
                              Verwijder
                            </button>
                          </div>
                        </div>

                        <div className="mt-2 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words rounded border border-black/10 bg-white/60 dark:bg-gray-950/20 p-2 max-h-32 overflow-auto">
                          {s.body}
                        </div>

                        <div className="mt-2 text-xs text-gray-600 dark:text-gray-300 space-y-1">
                          <div>Doelgroep: {s.target_all ? 'Iedereen' : `Geselecteerd (${(s.target_user_ids ?? []).length})`}</div>
                          <div>
                            Herhaling:{' '}
                            {s.repeat_minutes
                              ? `${s.repeat_minutes} min`
                              : s.repeat_weeks
                                ? `elke ${s.repeat_weeks} week`
                                : s.repeat_months
                                  ? `elke ${s.repeat_months} maand`
                                  : 'eenmalig'}
                          </div>
                          <div>Volgende: {fmt(s.next_run_at)}</div>
                          <div>Laatst: {fmt(s.last_run_at)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="text-xs text-gray-500 dark:text-gray-400">
              Let op: herhalende pushes vereisen een cron job die <code>/api/push/run-schedules</code> periodiek aanroept.
            </div>
          </div>
        )}
      </section>

      {editingSchedule ? (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-lg border border-black/10 bg-white dark:bg-gray-900 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold">Schedule wijzigen</div>
              <button onClick={closeEditSchedule} className="px-2 py-1 rounded border border-black/15 bg-white/70 hover:bg-white/90 text-sm dark:bg-white/5">
                Sluiten
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-2">
              <div>
                <label className="text-sm text-gray-700 dark:text-gray-200">Naam (optioneel)</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 rounded border border-black/15 bg-white/70 dark:bg-gray-900/40"
                />
              </div>
              <div className="flex items-end gap-2">
                <label className="text-sm text-gray-700 dark:text-gray-200">Actief</label>
                <input type="checkbox" checked={editEnabled} onChange={(e) => setEditEnabled(e.target.checked)} />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              <label className="text-sm">Herhaling</label>
              <select
                value={editRepeat}
                onChange={(e) => setEditRepeat(e.target.value)}
                className="px-3 py-2 rounded border border-black/15 bg-white/70 dark:bg-gray-900/40"
              >
                <option value="once">Eenmalig</option>
                <option value="m:15">Elke 15 min</option>
                <option value="m:30">Elke 30 min</option>
                <option value="m:60">Elk uur</option>
                <option value="m:1440">Elke dag</option>
                <option value="w:1">Elke week</option>
                <option value="mo:1">Elke maand</option>
              </select>

              <label className="text-sm ml-2">Doelgroep</label>
              <select
                value={editTarget}
                onChange={(e) => setEditTarget(e.target.value === 'users' ? 'users' : 'all')}
                className="px-3 py-2 rounded border border-black/15 bg-white/70 dark:bg-gray-900/40"
              >
                <option value="all">Iedereen</option>
                <option value="users">Geselecteerd</option>
              </select>
            </div>

            <div className="grid sm:grid-cols-[1fr_auto] gap-2 items-end">
              <div>
                <label className="text-sm text-gray-700 dark:text-gray-200">Volgende run</label>
                <input
                  type="datetime-local"
                  value={editNextRun}
                  onChange={(e) => setEditNextRun(e.target.value)}
                  className="w-full px-3 py-2 rounded border border-black/15 bg-white/70 dark:bg-gray-900/40"
                />
              </div>
              <button
                onClick={() => setEditNextRun(toDatetimeLocal(new Date().toISOString()))}
                className="px-3 py-2 rounded border border-black/15 bg-white/70 hover:bg-white/90 text-sm dark:bg-white/5"
                title="Zet volgende run op nu"
              >
                Nu
              </button>
            </div>

            <div className="text-xs text-gray-600 dark:text-gray-300">
              Ontvangers: {resolvedRecipientIds.length}
              {excludedIdList.length > 0 ? ` · Uitzonderingen: ${excludedIdList.length}` : ''}
              {editTarget === 'users' ? ' · Tip: pas ontvangers aan via het “Ontvangers” paneel.' : ''}
            </div>

            <div>
              <label className="text-sm text-gray-700 dark:text-gray-200">Bericht</label>
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                rows={5}
                className="w-full px-3 py-2 rounded border border-black/15 bg-white/70 dark:bg-gray-900/40"
              />
            </div>

            <div className="flex flex-wrap gap-2 items-center justify-between">
              <button
                onClick={saveScheduleEdits}
                disabled={editBusy || !editBody.trim()}
                className="px-3 py-2 rounded border border-orange-500/60 hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10 disabled:opacity-50"
              >
                {editBusy ? 'Opslaan…' : 'Opslaan'}
              </button>
              {editMsg ? <div className="text-sm text-gray-800 dark:text-gray-200">{editMsg}</div> : null}
            </div>
          </div>
        </div>
      ) : null}

      {groupModalOpen ? (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-lg border border-black/10 bg-white dark:bg-gray-900 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold">{groupEditing ? 'Groep aanpassen' : 'Groep maken'}</div>
              <button
                onClick={closeGroupModal}
                className="px-2 py-1 rounded border border-black/15 bg-white/70 hover:bg-white/90 text-sm dark:bg-white/5"
              >
                Sluiten
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-2 items-end">
              <div>
                <label className="text-sm text-gray-700 dark:text-gray-200">Groepsnaam</label>
                <input
                  value={groupFormName}
                  onChange={(e) => setGroupFormName(e.target.value)}
                  placeholder="Bijv. Team A"
                  className="w-full px-3 py-2 rounded border border-black/15 bg-white/70 dark:bg-gray-900/40"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-gray-600 dark:text-gray-300">Geselecteerd: {groupFormSelectedIds.length}</div>
                <input
                  value={groupFormSearch}
                  onChange={(e) => setGroupFormSearch(e.target.value)}
                  placeholder="Zoek werknemer…"
                  className="px-3 py-2 rounded border border-black/15 bg-white/70 dark:bg-gray-900/40 text-sm"
                />
              </div>
            </div>

            <div className="max-h-80 overflow-auto rounded border border-black/10 bg-white/60 dark:bg-gray-950/20 p-2">
              {targets
                .filter((t) => {
                  const q = groupFormSearch.trim().toLowerCase()
                  if (!q) return true
                  const label = `${t.name ?? ''} ${t.email ?? ''} ${t.id}`.toLowerCase()
                  return label.includes(q)
                })
                .map((t) => (
                  <label key={t.id} className="flex items-center gap-2 py-1 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(groupFormSelectedUserIds[String(t.id)])}
                      onChange={(e) =>
                        setGroupFormSelectedUserIds((p) => ({
                          ...p,
                          [String(t.id)]: e.target.checked,
                        }))
                      }
                    />
                    <span className="truncate">
                      {t.name || t.email || t.id}
                      {t.email ? <span className="text-gray-500"> ({t.email})</span> : null}
                    </span>
                  </label>
                ))}
            </div>

            <div className="flex flex-wrap gap-2 items-center justify-between">
              <button
                onClick={saveGroupModal}
                disabled={groupBusy}
                className="px-3 py-2 rounded border border-orange-500/60 hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10 disabled:opacity-50"
              >
                {groupBusy ? 'Opslaan…' : 'Opslaan'}
              </button>
              {groupMsg ? <div className="text-sm text-gray-800 dark:text-gray-200">{groupMsg}</div> : null}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
