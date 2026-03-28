'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

type StoredField = {
  type: string
  value?: string
  checked?: boolean
}

type StoredDraft = Record<string, StoredField>

const STORAGE_PREFIX = 'form-draft:'

const skipInputTypes = new Set([
  'password',
  'file',
  'hidden',
  'submit',
  'button',
  'reset',
])

const cssEscapeSafe = (value: string) => {
  if (typeof (window as any).CSS !== 'undefined' && typeof (window as any).CSS.escape === 'function') {
    return (window as any).CSS.escape(value)
  }
  return value.replace(/(["\\])/g, '\\$1')
}

const keyFromElement = (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) => {
  const explicit = el.getAttribute('data-persist-key')
  if (explicit) return explicit

  const name = el.getAttribute('name')
  if (name) return `name:${name}`

  const id = el.getAttribute('id')
  if (id) return `id:${id}`

  const placeholder = el.getAttribute('placeholder')
  if (placeholder) return `placeholder:${el.tagName.toLowerCase()}:${placeholder}`

  // Last-resort fallback to a DOM path to support fields without name/id.
  let node: Element | null = el
  const parts: string[] = []
  while (node && node !== document.body) {
    const parent = node.parentElement
    const tag = node.tagName.toLowerCase()
    if (!parent) {
      parts.push(tag)
      break
    }
    const siblings = Array.from(parent.children).filter((c) => c.tagName === node!.tagName)
    const idx = siblings.indexOf(node) + 1
    parts.push(`${tag}:nth-of-type(${idx})`)
    node = parent
  }
  return `path:${parts.reverse().join('>')}`
}

const isPersistable = (el: Element): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement => {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
    return false
  }
  if (el.hasAttribute('data-no-persist')) return false
  if ((el as any).disabled || (el as any).readOnly) return false

  if (el instanceof HTMLInputElement) {
    const t = (el.type || 'text').toLowerCase()
    if (skipInputTypes.has(t)) return false
  }
  return true
}

const buildStorageKey = (pathname: string) => `${STORAGE_PREFIX}${pathname}`

export default function FormDraftPersistence() {
  const pathname = usePathname() || '/'
  const restoreTimersRef = useRef<number[]>([])

  useEffect(() => {
    const storageKey = buildStorageKey(pathname)

    const saveDraft = () => {
      try {
        const fields = Array.from(document.querySelectorAll('input, textarea, select'))
        const draft: StoredDraft = {}

        for (const node of fields) {
          if (!isPersistable(node)) continue
          const key = keyFromElement(node)

          if (node instanceof HTMLInputElement) {
            const t = (node.type || 'text').toLowerCase()
            if (t === 'checkbox' || t === 'radio') {
              draft[key] = { type: t, checked: Boolean(node.checked) }
            } else {
              draft[key] = { type: t, value: node.value ?? '' }
            }
          } else {
            draft[key] = { type: node.tagName.toLowerCase(), value: node.value ?? '' }
          }
        }

        window.sessionStorage.setItem(storageKey, JSON.stringify(draft))
      } catch {
        // Ignore storage/quota/privacy mode errors.
      }
    }

    const restoreDraft = () => {
      try {
        const raw = window.sessionStorage.getItem(storageKey)
        if (!raw) return 0
        const draft = JSON.parse(raw) as StoredDraft

        let restoredCount = 0

        for (const [fieldKey, stored] of Object.entries(draft)) {
          let el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null = null

          if (fieldKey.startsWith('name:')) {
            const name = fieldKey.slice(5)
            el = document.querySelector(`[name="${cssEscapeSafe(name)}"]`) as any
          } else if (fieldKey.startsWith('id:')) {
            const id = fieldKey.slice(3)
            el = document.getElementById(id) as any
          } else if (fieldKey.startsWith('placeholder:')) {
            const [, tag, placeholder] = fieldKey.split(':')
            el = document.querySelector(`${tag}[placeholder="${cssEscapeSafe(placeholder)}"]`) as any
          } else if (fieldKey.startsWith('path:')) {
            const path = fieldKey.slice(5)
            el = document.querySelector(path) as any
          }

          if (!el || !isPersistable(el)) continue

          if (el instanceof HTMLInputElement) {
            const t = (el.type || 'text').toLowerCase()
            if ((t === 'checkbox' || t === 'radio') && typeof stored.checked === 'boolean') {
              if (el.checked !== stored.checked) {
                el.checked = stored.checked
                el.dispatchEvent(new Event('change', { bubbles: true }))
                restoredCount += 1
              }
            } else if (typeof stored.value === 'string' && el.value !== stored.value) {
              el.value = stored.value
              el.dispatchEvent(new Event('input', { bubbles: true }))
              el.dispatchEvent(new Event('change', { bubbles: true }))
              restoredCount += 1
            }
          } else if (typeof stored.value === 'string' && el.value !== stored.value) {
            el.value = stored.value
            el.dispatchEvent(new Event('input', { bubbles: true }))
            el.dispatchEvent(new Event('change', { bubbles: true }))
            restoredCount += 1
          }
        }

        return restoredCount
      } catch {
        // Ignore corrupted JSON etc.
        return 0
      }
    }

    const clearRestoreTimers = () => {
      for (const t of restoreTimersRef.current) window.clearTimeout(t)
      restoreTimersRef.current = []
    }

    const scheduleRestore = (attempts = 20, delayMs = 150) => {
      clearRestoreTimers()
      for (let i = 0; i < attempts; i += 1) {
        const id = window.setTimeout(() => {
          restoreDraft()
        }, i * delayMs)
        restoreTimersRef.current.push(id)
      }
    }

    const onInput = () => saveDraft()
    const onChange = () => saveDraft()
    const onPageHide = () => saveDraft()
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') saveDraft()
    }

    const onPageShow = () => scheduleRestore(10, 120)
    const onVisibilityVisible = () => {
      if (document.visibilityState === 'visible') scheduleRestore(8, 120)
    }

    // Restore repeatedly per route after mount/hydration to handle delayed-rendered forms.
    scheduleRestore()

    document.addEventListener('input', onInput, true)
    document.addEventListener('change', onChange, true)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('pageshow', onPageShow)
    document.addEventListener('visibilitychange', onVisibility)
    document.addEventListener('visibilitychange', onVisibilityVisible)

    return () => {
      clearRestoreTimers()
      document.removeEventListener('input', onInput, true)
      document.removeEventListener('change', onChange, true)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('pageshow', onPageShow)
      document.removeEventListener('visibilitychange', onVisibility)
      document.removeEventListener('visibilitychange', onVisibilityVisible)
    }
  }, [pathname])

  return null
}
