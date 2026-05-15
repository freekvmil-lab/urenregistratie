import { NextRequest, NextResponse } from 'next/server'

const APP_URL = 'https://urenregistratie-six.vercel.app'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId') ?? ''

  const clientId = process.env.GOOGLE_CLIENT_ID!
  const redirectUri = `${APP_URL}/api/google/callback`

  const scopes = [
    'https://www.googleapis.com/auth/calendar.events',
  ].join(' ')

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', scopes)
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('state', userId)

  return NextResponse.redirect(url.toString())
}
