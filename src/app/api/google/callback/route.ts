import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const APP_URL = 'https://urenregistratie-six.vercel.app'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(`${APP_URL}/admin/planning?error=no_code`)
  }

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

  // Get Supabase user from cookie
  let userId: string | null = null
  try {
    const cookieStore = await cookies()
    const allCookies = cookieStore.getAll()
    const authCookie = allCookies.find(c => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'))

    if (authCookie) {
      const session = JSON.parse(decodeURIComponent(authCookie.value))
      userId = session?.user?.id ?? null
    }

    // Try base64 encoded cookie too
    if (!userId) {
      const base64Cookie = allCookies.find(c => c.name.includes('auth-token'))
      if (base64Cookie) {
        try {
          const decoded = Buffer.from(base64Cookie.value, 'base64').toString()
          const parsed = JSON.parse(decoded)
          userId = parsed?.user?.id ?? parsed?.[0]?.user?.id ?? null
        } catch { /* ignore */ }
      }
    }
  } catch {
    return NextResponse.redirect(`${APP_URL}/admin/planning?error=session_error`)
  }

  if (!userId) {
    return NextResponse.redirect(`${APP_URL}/admin/planning?error=not_logged_in`)
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
