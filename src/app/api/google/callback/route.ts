import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url)

  const code = searchParams.get('code')
  const userId = searchParams.get('state') // 🔑

  if (!code || !userId) {
    return NextResponse.redirect(`${origin}/?error=oauth`)
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
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  console.log(userId)
  /* =========================
     3️⃣ Google account opslaan
  ========================= */
  const { error } = await supabase
    .from('google_accounts')
    .upsert(
      {
        user_id: userId,
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
     4️⃣ Klaar
  ========================= */
  return NextResponse.redirect(`${origin}/?google=connected`)
}
