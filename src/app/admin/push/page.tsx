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
  repeat_minutes: number | null
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
  const [groupName, setGroupName] = useState('')
  const [groupBusy, setGroupBusy] = useState(false)
  const [groupMsg, setGroupMsg] = useState<string | null>(null)
  const [selectedGroupIds, setSelectedGroupIds] = useState<Record<string, boolean>>({})

  const [sendMode, setSendMode] = useState<'all' | 'users'>('all')
  const [selectedUserIds, setSelectedUserIds] = useState<Record<string, boolean>>({})
  const [sendTitle, setSendTitle] = useState('Vortexx')
  const [sendBody, setSendBody] = useState('')
  const [sendUrl, setSendUrl] = useState('/')
  const [sendBusy, setSendBusy] = useState(false)
  const [sendResult, setSendResult] = useState<string | null>(null)

  const [schedules, setSchedules] = useState<ScheduleRow[]>([])
  const [schedulesLoading, setSchedulesLoading] = useState(false)
  const [schedError, setSchedError] = useState<string | null>(null)

  const [newName, setNewName] = useState('')
  const [newEnabled, setNewEnabled] = useState(true)
  const [newTarget, setNewTarget] = useState<'all' | 'users'>('all')
  const [newRepeat, setNewRepeat] = useState<string>('60')
  const [newNextRun, setNewNextRun] = useState<string>('')
  const [newTitle, setNewTitle] = useState('Vortexx')
  const [newBody, setNewBody] = useState('')
  const [newUrl, setNewUrl] = useState('/')
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

  const saveGroup = async () => {
    setGroupMsg(null)
    setGroupBusy(true)
    try {
      const name = groupName.trim()
      if (!name) {
        setGroupMsg('Geef een groepsnaam op')
        return
      }
      if (selectedIds.length === 0) {
        setGroupMsg('Selecteer eerst werknemers')
        return
      }

      const { data: sessionRes } = await supabase.auth.getSession()
      const token = sessionRes.session?.access_token
      if (!token) {
        setGroupMsg('Niet ingelogd')
        return
      }

      const res = await fetch('/api/admin/push/groups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, userIds: selectedIds }),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setGroupMsg(String(json?.details || json?.error || 'Groep opslaan mislukt'))
        return
      }

      setGroupName('')
      setGroupMsg('Groep opgeslagen')
      await loadGroups()
    } catch (e: any) {
      setGroupMsg(e?.message || 'Groep opslaan mislukt')
    } finally {
      setGroupBusy(false)
    }
  }

  const applyGroupToSelection = (g: TargetGroup) => {
    setSelectedUserIds((prev) => {
      const next = { ...prev }
      for (const uid of g.user_ids ?? []) next[String(uid)] = true
      return next
    })
  }

  const overwriteGroupWithSelection = async (g: TargetGroup) => {
    setGroupMsg(null)
    setGroupBusy(true)
    try {
      const { data: sessionRes } = await supabase.auth.getSession()
      const token = sessionRes.session?.access_token
      if (!token) return

      const res = await fetch(`/api/admin/push/groups/${encodeURIComponent(g.id)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userIds: selectedIds }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.details || json?.error || 'Groep bijwerken mislukt'))
      setGroupMsg('Groep bijgewerkt')
      await loadGroups()
    } catch (e: any) {
      setGroupMsg(e?.message || 'Groep bijwerken mislukt')
    } finally {
      setGroupBusy(false)
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
          target: sendMode,
          userIds: sendMode === 'users' ? selectedIds : undefined,
          groupIds: sendMode === 'users' ? selectedGroupIdList : undefined,
          title: sendTitle,
          body: sendBody,
          url: sendUrl,
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

      const repeatMinutes = newRepeat === 'once' ? null : Number(newRepeat)
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
          title: newTitle,
          body: newBody,
          url: newUrl,
          target: newTarget,
          userIds: newTarget === 'users' ? selectedIds : undefined,
          groupIds: newTarget === 'users' ? selectedGroupIdList : undefined,
          repeatMinutes,
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

        <div className="grid md:grid-cols-2 gap-3">
          <div className="rounded border border-black/10 bg-white/50 dark:bg-gray-900/30 p-3 space-y-2">
            <div className="font-semibold text-sm">Groepen</div>

            {groups.length === 0 ? (
              <div className="text-sm text-gray-600 dark:text-gray-300">Nog geen groepen.</div>
            ) : (
              <div className="max-h-48 overflow-auto space-y-1">
                {groups.map((g) => (
                  <div key={g.id} className="flex items-center gap-2 justify-between">
                    <label className="flex items-center gap-2 text-sm min-w-0">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedGroupIds[g.id])}
                        onChange={(e) => setSelectedGroupIds((p) => ({ ...p, [g.id]: e.target.checked }))}
                      />
                      <span className="truncate">{g.name}</span>
                      <span className="text-xs text-gray-500">({(g.user_ids ?? []).length})</span>
                    </label>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => applyGroupToSelection(g)}
                        className="px-2 py-1 rounded border border-black/15 bg-white/60 hover:bg-white/80 text-xs"
                        title="Voeg leden toe aan selectie"
                      >
                        Gebruik
                      </button>
                      <button
                        onClick={() => overwriteGroupWithSelection(g)}
                        disabled={groupBusy}
                        className="px-2 py-1 rounded border border-black/15 bg-white/60 hover:bg-white/80 text-xs disabled:opacity-50"
                        title="Overschrijf groep met huidige selectie"
                      >
                        Update
                      </button>
                      <button
                        onClick={() => deleteGroup(g)}
                        disabled={groupBusy}
                        className="px-2 py-1 rounded border border-black/15 bg-white/60 hover:bg-white/80 text-xs disabled:opacity-50"
                        title="Verwijder groep"
                      >
                        X
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2 border-t border-black/10 space-y-2">
              <div className="text-xs text-gray-600 dark:text-gray-300">
                Tip: selecteer werknemers en klik “Opslaan”. Daarna kun je de groep aanvinken bij versturen/schedule.
              </div>
              <div className="flex gap-2">
                <input
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Nieuwe groepsnaam"
                  className="flex-1 px-3 py-2 rounded border border-black/15 bg-white/70 dark:bg-gray-900/40"
                />
                <button
                  onClick={saveGroup}
                  disabled={groupBusy}
                  className="px-3 py-2 rounded border border-orange-500/60 hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10 disabled:opacity-50"
                >
                  Opslaan
                </button>
              </div>
              {groupMsg ? <div className="text-sm text-gray-800 dark:text-gray-200">{groupMsg}</div> : null}
            </div>
          </div>

          <div className="rounded border border-black/10 bg-white/50 dark:bg-gray-900/30 p-3 space-y-1">
            <div className="font-semibold text-sm">Selectie</div>
            <div className="text-xs text-gray-600 dark:text-gray-300">
              Geselecteerde werknemers: {selectedIds.length} · Geselecteerde groepen: {selectedGroupIdList.length}
            </div>
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
              <div className="max-h-56 overflow-auto rounded border border-black/10 bg-white/50 dark:bg-gray-900/30 p-2">
                {targets.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 py-1 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedUserIds[t.id])}
                      onChange={(e) => setSelectedUserIds((p) => ({ ...p, [t.id]: e.target.checked }))}
                    />
                    <span className="truncate">
                      {t.name || t.email || t.id}
                      {t.email ? <span className="text-gray-500"> ({t.email})</span> : null}
                    </span>
                  </label>
                ))}
              </div>
            ) : null}

            <div className="grid sm:grid-cols-2 gap-2">
              <input
                value={sendTitle}
                onChange={(e) => setSendTitle(e.target.value)}
                placeholder="Titel"
                className="px-3 py-2 rounded border border-black/15 bg-white/70 dark:bg-gray-900/40"
              />
              <input
                value={sendUrl}
                onChange={(e) => setSendUrl(e.target.value)}
                placeholder="Url (bv. /intranet)"
                className="px-3 py-2 rounded border border-black/15 bg-white/70 dark:bg-gray-900/40"
              />
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
                    <option value="15">Elke 15 min</option>
                    <option value="30">Elke 30 min</option>
                    <option value="60">Elk uur</option>
                    <option value="1440">Elke dag</option>
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
                  <input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Titel"
                    className="px-3 py-2 rounded border border-black/15 bg-white/70 dark:bg-gray-900/40"
                  />
                  <input
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    placeholder="Url (bv. /availability)"
                    className="px-3 py-2 rounded border border-black/15 bg-white/70 dark:bg-gray-900/40"
                  />
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

                        <div className="mt-2 text-xs text-gray-600 dark:text-gray-300 space-y-1">
                          <div>Doelgroep: {s.target_all ? 'Iedereen' : `Geselecteerd (${(s.target_user_ids ?? []).length})`}</div>
                          <div>Herhaling: {s.repeat_minutes ? `${s.repeat_minutes} min` : 'eenmalig'}</div>
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
    </main>
  )
}
