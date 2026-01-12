import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.json({ error: 'No code' }, { status: 400 })
  }

  // 1️⃣ exchange code → token
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
    console.error(token)
    return NextResponse.json({ error: 'Token exchange failed' }, { status: 500 })
  }

  // 2️⃣ Supabase server client
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // ⚠️ server only
  )

  // 3️⃣ huidige user ophalen via cookie
  const authHeader = req.headers.get('cookie') ?? ''
  const {
    data: { user },
  } = await supabase.auth.getUser(authHeader)

  if (!user) {
    return NextResponse.redirect(`${origin}/login`)
  }

  // 4️⃣ token opslaan
  await supabase.from('google_accounts').upsert({
    user_id: user.id,
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(),
  })

  return NextResponse.redirect(`${origin}/?google=connected`)
}
