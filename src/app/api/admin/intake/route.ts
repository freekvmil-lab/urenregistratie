import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const pickSupabaseAccessToken = async (req: Request) => {
  const authHeader = req.headers.get('authorization')
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1]
  }

  const cookieStore = await cookies()
  const authCookie = cookieStore
    .getAll()
    .find((c) => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'))

  if (!authCookie) return undefined

  try {
    const session = JSON.parse(decodeURIComponent(authCookie.value))
    return session?.access_token
  } catch {
    return undefined
  }
}

const getAdminClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY)')
  }
  return createClient(url, serviceKey)
}

const requireAdmin = async (req: Request) => {
  const supabaseAccessToken = await pickSupabaseAccessToken(req)
  if (!supabaseAccessToken) {
    return { ok: false as const, res: NextResponse.json({ error: 'not_authenticated' }, { status: 401 }) }
  }

  const supabase = getAdminClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(supabaseAccessToken)

  if (userError || !user) {
    return { ok: false as const, res: NextResponse.json({ error: 'not_authenticated' }, { status: 401 }) }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    return { ok: false as const, res: NextResponse.json({ error: 'profile_lookup_failed' }, { status: 500 }) }
  }

  if (profile?.role !== 'admin') {
    return { ok: false as const, res: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  }

  return { ok: true as const, supabase, callerId: user.id }
}

function sanitizeFilename(name: string): string {
  const trimmed = String(name ?? '').trim()
  const base = trimmed || 'inschrijfformulier.pdf'
  return base
    .replace(/[/\\]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[^a-zA-Z0-9 ._\-()]/g, '')
    .slice(0, 120)
}

function extractByLabel(text: string, label: RegExp): string | null {
  return extractAfterLabel(text, label)
}

const KNOWN_LABELS: RegExp[] = [
  /^naam bedrijf\b/i,
  /^mailadres werknemer\b/i,
  /^e-?mail\b/i,
  /^naam\b/i,
  /^meisjesnaam\b/i,
  /^voorletters\b/i,
  /^roepnaam\b/i,
  /^adres\b/i,
  /^postcode\b/i,
  /^woonplaats\b/i,
  /^geboortedatum\b/i,
  /^telefoonnummer\b/i,
  /^geslacht\b/i,
  /^nationaliteit\b/i,
  /^burgerlijke staat\b/i,
  /^bsn-nummer\b/i,
  /^iban-nummer\b/i,
  /^datum in dienst\b/i,
  /^beroep\b/i,
]

function isProbablyLabelLine(line: string): boolean {
  const s = line.trim()
  if (!s) return true
  return KNOWN_LABELS.some((rx) => rx.test(s))
}

function extractAfterLabel(text: string, label: RegExp): string | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!label.test(line)) continue

    // Same-line value, e.g. "Adres Dorpsstraat 1" or "E-mail: a@b.nl"
    const sameLine = line.replace(label, '').trim().replace(/^[:\-]/, '').trim()
    if (sameLine) return sameLine

    // Next-line value (common in forms)
    const next = lines[i + 1]
    if (next && !isProbablyLabelLine(next)) return next.trim()
  }

  return null
}

function findLineIndex(lines: string[], label: RegExp): number {
  for (let i = 0; i < lines.length; i++) {
    if (label.test(lines[i])) return i
  }
  return -1
}

function extractEmail(text: string): string | null {
  const labeled =
    extractByLabel(text, /^mailadres werknemer\b/i) ||
    extractByLabel(text, /^e-?mail\b/i)
  if (labeled) {
    const m = labeled.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
    if (m) return m[0].toLowerCase()
  }

  const m = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  return m ? m[0].toLowerCase() : null
}

function extractName(text: string): string | null {
  const first = extractByLabel(text, /^voornaam\b/i)
  const last = extractByLabel(text, /^achternaam\b/i)
  if (first || last) {
    const full = `${first ?? ''} ${last ?? ''}`.trim()
    return full || null
  }

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  // Prefer the "Naam" field that appears after "Mailadres werknemer" in this form.
  const mailIdx = findLineIndex(lines, /^mailadres werknemer\b/i)
  if (mailIdx >= 0) {
    for (let i = mailIdx + 1; i < Math.min(lines.length, mailIdx + 8); i++) {
      if (/^naam\b/i.test(lines[i]) && !/^naam bedrijf\b/i.test(lines[i])) {
        const same = lines[i].replace(/^naam\b/i, '').trim()
        if (same) return same
        const next = lines[i + 1]
        if (next && !isProbablyLabelLine(next)) return next
        break
      }
    }
  }

  // Fallback: any "Naam" that isn't "Naam bedrijf"
  const labeled = extractByLabel(text, /^naam\b/i)
  if (labeled && !/^bedrijf\b/i.test(labeled)) return labeled

  return null
}

function extractAddress(text: string): string | null {
  const street = extractByLabel(text, /^(adres|woonadres|straat)\b/i)

  let postcode = extractByLabel(text, /^postcode\b/i)
  let woonplaats = extractByLabel(text, /^woonplaats\b/i)

  // This form often renders Postcode + Woonplaats on the same line.
  if (!woonplaats || (postcode && /\bwoonplaats\b/i.test(postcode))) {
    const parsed = extractPostcodeWoonplaats(text)
    if (parsed?.postcode) postcode = parsed.postcode
    if (parsed?.woonplaats) woonplaats = parsed.woonplaats
  }

  const parts: string[] = []
  if (street) parts.push(street)
  if (postcode && woonplaats) parts.push(`${postcode} ${woonplaats}`)
  else if (postcode) parts.push(postcode)
  else if (woonplaats) parts.push(woonplaats)

  const combined = parts.join(', ').trim()
  return combined || null
}

function extractPostcodeWoonplaats(text: string): { postcode: string | null; woonplaats: string | null } | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  for (const line of lines) {
    // Example: "Postcode 1613 KE Woonplaats Grootebroek"
    const m = line.match(/\bpostcode\b\s+(.+?)\s+\bwoonplaats\b\s+(.+)$/i)
    if (!m) continue
    const postcode = String(m[1] ?? '').trim() || null
    const woonplaats = String(m[2] ?? '').trim() || null
    if (postcode || woonplaats) return { postcode, woonplaats }
  }
  return null
}

type ParseResult = {
  email: string | null
  name: string | null
  home_address: string | null
  confidence: 'low' | 'medium'
  warnings: string[]
}

async function parsePdf(file: File): Promise<{ rawText: string; extracted: ParseResult }>{
  const buf = Buffer.from(await file.arrayBuffer())

  // pdfjs expects DOMMatrix to exist; Node doesn't provide it.
  if (!(globalThis as any).DOMMatrix) {
    const dm: any = await import('dommatrix')
    const CSSMatrix: any = dm?.default ?? dm
    ;(globalThis as any).DOMMatrix = CSSMatrix
  }

  // Use PDF.js directly.
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')

  // In bundled/serverless environments, `require.resolve()` can be transformed into a
  // numeric module id, which then breaks path/URL logic. Instead, preload the worker
  // module into `globalThis.pdfjsWorker` so PDF.js can set up its fake worker without
  // importing from a file path.
  if (!(globalThis as any).pdfjsWorker) {
    const pdfjsWorker: any = await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
    ;(globalThis as any).pdfjsWorker = pdfjsWorker
  }

  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buf), disableWorker: true })
  const doc = await loadingTask.promise

  const parts: string[] = []
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum)
    const content = await page.getTextContent()
    const pageText = (content.items ?? [])
      .map((it: any) => String(it?.str ?? '').trim())
      .filter(Boolean)
      .join(' ')
    if (pageText) parts.push(pageText)
  }

  const rawText = parts.join('\n')
  await doc.destroy().catch(() => {})
  await loadingTask.destroy?.().catch?.(() => {})
  const text = rawText.replace(/\u0000/g, ' ')

  const email = extractEmail(text)
  const name = extractName(text)
  const home_address = extractAddress(text)

  const warnings: string[] = []
  if (!email) warnings.push('Geen e-mail gevonden')
  if (!name) warnings.push('Geen naam gevonden')
  if (!home_address) warnings.push('Geen adres gevonden')

  const confidence: 'low' | 'medium' = warnings.length >= 2 ? 'low' : 'medium'

  return {
    rawText,
    extracted: {
      email,
      name,
      home_address,
      confidence,
      warnings,
    },
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return auth.res

    const form = await req.formData()
    const mode = String(form.get('mode') ?? 'parse')

    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'missing_file' }, { status: 400 })
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'only_pdf_supported', details: 'Upload een PDF (met selecteerbare tekst).' }, { status: 400 })
    }

    const { extracted } = await parsePdf(file)

    if (mode === 'parse') {
      return NextResponse.json({ ok: true, extracted })
    }

    if (mode !== 'create') {
      return NextResponse.json({ error: 'invalid_mode' }, { status: 400 })
    }

    // Allow overrides from the form (admin can correct extracted values)
    const email = String(form.get('email') ?? extracted.email ?? '').trim().toLowerCase()
    const nameRaw = String(form.get('name') ?? extracted.name ?? '').trim()
    const homeAddrRaw = String(form.get('home_address') ?? extracted.home_address ?? '').trim()

    const name = nameRaw ? nameRaw : null
    const home_address = homeAddrRaw ? homeAddrRaw : null

    if (!email) {
      return NextResponse.json({ error: 'missing_email', extracted }, { status: 400 })
    }

    const origin = new URL(req.url).origin

    const { data: invited, error: inviteError } = await auth.supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${origin}/reset-password`,
    })

    if (inviteError || !invited?.user?.id) {
      return NextResponse.json(
        { error: 'invite_failed', details: inviteError?.message ?? null },
        { status: 400 }
      )
    }

    const newUserId = invited.user.id

    const { error: upsertError } = await auth.supabase
      .from('profiles')
      .upsert(
        {
          id: newUserId,
          email,
          name,
          role: 'employee',
          home_address,
        },
        { onConflict: 'id' }
      )

    if (upsertError) {
      return NextResponse.json(
        { error: 'profile_upsert_failed', details: upsertError.message },
        { status: 500 }
      )
    }

    // Store the intake form as a document on the new user
    const safeFilename = sanitizeFilename(file.name)
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const objectPath = `employee/${newUserId}/intake/${ts}-${safeFilename}`

    const upload = await auth.supabase.storage
      .from('employee-documents')
      .upload(objectPath, Buffer.from(await file.arrayBuffer()), {
        contentType: file.type || 'application/pdf',
        upsert: false,
      })

    if (upload.error) {
      return NextResponse.json(
        { error: 'storage_upload_failed', details: upload.error.message, user_id: newUserId },
        { status: 500 }
      )
    }

    const meta = await auth.supabase
      .from('employee_documents')
      .insert({
        employee_id: newUserId,
        filename: safeFilename,
        object_path: objectPath,
        mime_type: file.type || 'application/pdf',
        size_bytes: Number.isFinite(file.size) ? file.size : null,
        uploaded_by: auth.callerId,
      })

    if (meta.error) {
      // best-effort cleanup
      await auth.supabase.storage.from('employee-documents').remove([objectPath])
      return NextResponse.json(
        { error: 'metadata_insert_failed', details: meta.error.message, user_id: newUserId },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true, id: newUserId, extracted })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'unexpected_error', details: String(err?.message ?? err) },
      { status: 500 }
    )
  }
}
