// api/google/callback/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')
  const userId = searchParams.get('state') // expliciet

  if (!code || !userId) {
    return NextResponse.redirect(`${origin}/?error=oauth`)
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
      grant_type: 'authorization_code',
    }),
  })

  const token = await tokenRes.json()
  if (!token.access_token) {
    return NextResponse.redirect(`${origin}/?error=token`)
  }

  const expiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Google may omit refresh_token on subsequent authorizations.
  // Never overwrite an existing refresh_token with null/undefined.
  const { data: existing } = await supabase
    .from('google_accounts')
    .select('refresh_token')
    .eq('user_id', userId)
    .maybeSingle()

  const refreshToStore = token.refresh_token ?? (existing as any)?.refresh_token ?? null

  // Avoid relying on an upsert constraint that might not exist.
  // Always overwrite the access_token on reconnect.
  const { data: updated, error: updateError } = await supabase
    .from('google_accounts')
    .update({
      access_token: token.access_token,
      refresh_token: refreshToStore,
      expires_at: expiresAt,
    })
    .eq('user_id', userId)
    .select('user_id')

  if (updateError) {
    return NextResponse.redirect(`${origin}/?error=google_store`)
  }

  if (!updated || updated.length === 0) {
    const { error: insertError } = await supabase.from('google_accounts').insert({
      user_id: userId,
      access_token: token.access_token,
      refresh_token: refreshToStore,
      expires_at: expiresAt,
    })

    if (insertError) {
      return NextResponse.redirect(`${origin}/?error=google_store`)
    }
  }

  return NextResponse.redirect(`${origin}/`)
}
