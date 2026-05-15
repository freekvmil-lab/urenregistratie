import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect('/admin/planning?error=no_code')
  }

  const redirectUri = 'https://urenregistratie-six.vercel.app/api/google/callback'

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  const tokens = await tokenRes.json()

  if (!tokens.access_token) {
    return NextResponse.redirect('/admin/planning?error=token_failed')
  }

  // Get Supabase user from cookie
  const cookieStore = await cookies()
  const authCookie = cookieStore.getAll().find(c => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'))
  if (!authCookie) return NextResponse.redirect('/admin/planning?error=not_logged_in')

  let userId: string
  try {
    const session = JSON.parse(decodeURIComponent(authCookie.value))
    userId = session?.user?.id
    if (!userId) throw new Error('no user id')
  } catch {
    return NextResponse.redirect('/admin/planning?error=session_error')
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://shxlihgfdzfxwjewjnmj.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  await supabase.from('google_tokens').upsert({
    user_id: userId,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null,
    scope: tokens.scope,
  }, { onConflict: 'user_id' })

  return NextResponse.redirect('/admin/planning?connected=1')
}
