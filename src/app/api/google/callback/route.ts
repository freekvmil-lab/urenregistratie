import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(`${origin}/?error=no_code`)
  }

  // 1️⃣ Google OAuth code → token
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

  // 2️⃣ ✅ JUISTE Supabase client voor route.ts
  const supabase = createRouteHandlerClient({ cookies })

  // 3️⃣ Huidige user
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
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
