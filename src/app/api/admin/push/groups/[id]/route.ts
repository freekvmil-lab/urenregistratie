import { NextResponse } from 'next/server'
import { requireAdmin } from '../../_utils'

export const runtime = 'nodejs'

type PatchBody = {
  name?: string
  userIds?: string[]
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return auth.res

    const { id } = await ctx.params
    const groupId = String(id ?? '').trim()
    if (!groupId) return NextResponse.json({ error: 'missing_id' }, { status: 400 })

    let body: PatchBody
    try {
      body = (await req.json()) as PatchBody
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
    }

    const patch: any = {}
    if (typeof body.name === 'string') patch.name = body.name.trim()
    if (Array.isArray(body.userIds)) patch.user_ids = body.userIds.map(String).filter(Boolean)

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'nothing_to_update' }, { status: 400 })
    }

    const { error } = await auth.supabase.from('push_target_groups').update(patch).eq('id', groupId)
    if (error) {
      return NextResponse.json({ error: 'group_update_failed', details: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: 'unexpected_error', details: String(err?.message ?? err) }, { status: 500 })
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return auth.res

    const { id } = await ctx.params
    const groupId = String(id ?? '').trim()
    if (!groupId) return NextResponse.json({ error: 'missing_id' }, { status: 400 })

    const { error } = await auth.supabase.from('push_target_groups').delete().eq('id', groupId)
    if (error) {
      return NextResponse.json({ error: 'group_delete_failed', details: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: 'unexpected_error', details: String(err?.message ?? err) }, { status: 500 })
  }
}
