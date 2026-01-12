import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(`${origin}/?error=no_code`)
  }

  // 1️⃣ Google OAuth → token
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

  // 2️⃣ Supabase SERVER client (service role)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 3️⃣ User ophalen via auth cookie
  const authHeader = req.headers.get('cookie') ?? ''
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(authHeader)

  if (error || !user) {
    return NextResponse.redirect(`${origin}/login`)
  }

  // 4️⃣ Google account opslaan
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

  // 5️⃣ Klaar
  return NextResponse.redirect(`${origin}/?google=connected`)
}
