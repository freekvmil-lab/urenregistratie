import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: Request) {
  const { origin } = new URL(req.url)

  // 🔐 Supabase server client (service role)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 👉 huidige gebruiker ophalen via auth header
  const authHeader = req.headers.get('authorization') ?? ''

  const {
    data: { user },
  } = await supabase.auth.getUser(authHeader)

  if (!user) {
    return NextResponse.redirect(`${origin}/login`)
  }

  // 🔑 user.id in OAuth state stoppen
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    access_type: 'offline',
    prompt: 'consent',
    state: user.id, // ⭐ BELANGRIJK
  })

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  return NextResponse.redirect(url)
}
