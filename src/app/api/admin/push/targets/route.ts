import { NextResponse } from 'next/server'
import { requireAdmin } from '../_utils'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return auth.res

    const { data, error } = await auth.supabase
      .from('profiles')
      .select('id, name, email, role, deleted_at')
      .is('deleted_at', null)
      .order('name')

    if (error) {
      return NextResponse.json({ error: 'profiles_query_failed', details: error.message }, { status: 400 })
    }

    const targets = (data ?? []).map((p: any) => ({
      id: String(p.id),
      name: p.name === null || p.name === undefined ? null : String(p.name),
      email: p.email === null || p.email === undefined ? null : String(p.email),
      role: String(p.role ?? 'employee'),
    }))

    return NextResponse.json({ ok: true, targets })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'unexpected_error', details: String(err?.message ?? err) },
      { status: 500 }
    )
  }
}
