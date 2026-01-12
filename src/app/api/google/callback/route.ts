import { NextResponse } from 'next/server'
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
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
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
  ========================= */
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // server only
  )

  /* =========================
     3️⃣ Access token uit cookie
  ========================= */
  const cookieHeader = req.headers.get('cookie') ?? ''

  // zoek sb-*-auth-token cookie
  const match = cookieHeader.match(
    /sb-[^=]+-auth-token=([^;]+)/
  )

  if (!match) {
    console.error('No Supabase auth cookie found')
    return NextResponse.redirect(`${origin}/login`)
  }

  const supabaseToken = JSON.parse(
    decodeURIComponent(match[1])
  )?.access_token

  if (!supabaseToken) {
    console.error('No access token in cookie')
    return NextResponse.redirect(`${origin}/login`)
  }

  /* =========================
     4️⃣ User ophalen
  ========================= */
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(supabaseToken)

  if (error || !user) {
    console.error('User fetch failed', error)
    return NextResponse.redirect(`${origin}/login`)
  }

  /* =========================
     5️⃣ Google account opslaan
  ========================= */
  await supabase.from('google_accounts').upsert(
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

  /* =========================
     6️⃣ Klaar
  ========================= */
  return NextResponse.redirect(`${origin}/?google=connected`)
}
