import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

interface TokenRow {
  user_id: string
  access_token: string
  refresh_token: string
  expiry_date: number | null
}

const getServiceClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://shxlihgfdzfxwjewjnmj.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getValidAccessToken(userId: string, supabase: ReturnType<typeof getServiceClient>) {
  const { data } = await supabase
    .from('google_tokens')
    .select('user_id, access_token, refresh_token, expiry_date')
    .eq('user_id', userId)
    .single()

  const tokenRow = data as TokenRow | null
  if (!tokenRow) return null

  if (tokenRow.expiry_date && Date.now() > tokenRow.expiry_date - 60000) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: tokenRow.refresh_token,
        grant_type: 'refresh_token',
      }),
    })
    const refreshed = await res.json()
    if (refreshed.access_token) {
      await supabase.from('google_tokens').update({
        access_token: refreshed.access_token,
        expiry_date: Date.now() + (refreshed.expires_in ?? 3600) * 1000,
      }).eq('user_id', userId)
      return refreshed.access_token as string
    }
    return null
  }
  return tokenRow.access_token
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')
  const timeMin = searchParams.get('timeMin')
  const timeMax = searchParams.get('timeMax')

  if (!userId || !timeMin || !timeMax) {
    return NextResponse.json({ error: 'missing_params' }, { status: 400 })
  }

  const supabase = getServiceClient()
  const accessToken = await getValidAccessToken(userId, supabase)

  if (!accessToken) {
    return NextResponse.json({ events: [] })
  }

  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
  url.searchParams.set('timeMin', timeMin)
  url.searchParams.set('timeMax', timeMax)
  url.searchParams.set('singleEvents', 'true')
  url.searchParams.set('orderBy', 'startTime')
  url.searchParams.set('maxResults', '100')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  const data = await res.json()
  return NextResponse.json({ events: data.items ?? [] })
}
