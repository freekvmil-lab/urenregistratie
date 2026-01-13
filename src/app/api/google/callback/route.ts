import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(`${origin}/?error=no_code`)
  }

  /* =========================
     1️⃣ Google code → token
  ========================= */
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
    console.error('Google token error:', token)
    return NextResponse.redirect(`${origin}/?error=token`)
  }

  /* =========================
     2️⃣ Supabase server client
     (SERVICE ROLE, server only)
  ========================= */
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  /* =========================
     3️⃣ Supabase user via auth cookie
  ========================= */
  const cookieStore = await cookies()
  const authCookie = cookieStore
    .getAll()
    .find(
      (c) =>
        c.name.startsWith('sb-') &&
        c.name.endsWith('-auth-token')
    )

  if (!authCookie) {
    console.error('No Supabase auth cookie found')
    return NextResponse.redirect(`${origin}/login`)
  }

  const session = JSON.parse(
    decodeURIComponent(authCookie.value)
  )

  const accessToken = session?.access_token

  if (!accessToken) {
    console.error('No access token in auth cookie')
    return NextResponse.redirect(`${origin}/login`)
  }

  /* =========================
     4️⃣ User ophalen
  ========================= */
  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(accessToken)

  if (userError || !user) {
    console.error('User fetch failed', userError)
    return NextResponse.redirect(`${origin}/login`)
  }

  console.log('Saving Google account for user:', user.id)

  /* =========================
     5️⃣ Google account opslaan
  ========================= */
  const { error } = await supabaseAdmin
    .from('google_accounts')
    .upsert(
      {
        user_id: user.id,
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expires_at: new Date(
          Date.now() + token.expires_in * 1000
        ).toISOString(),
      },
      { onConflict: 'user_id' }
    )

  if (error) {
    console.error('Supabase upsert error:', error)
    return NextResponse.redirect(`${origin}/?error=db`)
  }

  /* =========================
     6️⃣ Klaar
  ========================= */
  return NextResponse.redirect(`${origin}/?google=connected`)
}
