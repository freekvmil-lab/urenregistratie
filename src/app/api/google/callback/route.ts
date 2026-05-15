import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const APP_URL = 'https://urenregistratie-six.vercel.app'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const userId = searchParams.get('state')

  if (!code) return NextResponse.redirect(`${APP_URL}/admin/planning?error=no_code`)
  if (!userId) return NextResponse.redirect(`${APP_URL}/admin/planning?error=no_user`)

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${APP_URL}/api/google/callback`,
      grant_type: 'authorization_code',
    }),
  })

  const tokens = await tokenRes.json()

  if (!tokens.access_token) {
    return NextResponse.redirect(`${APP_URL}/admin/planning?error=token_failed`)
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://shxlihgfdzfxwjewjnmj.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  await supabase.from('google_tokens').upsert({
    user_id: userId,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? '',
    expiry_date: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null,
    scope: tokens.scope ?? null,
  }, { onConflict: 'user_id' })

  return NextResponse.redirect(`${APP_URL}/admin/planning?connected=1`)
}
