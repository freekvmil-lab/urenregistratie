import { NextResponse } from 'next/server'

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID!
  const redirectUri = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/api/google/callback`
    : 'https://urenregistratie-six.vercel.app/api/google/callback'

  const scopes = [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/userinfo.email',
  ].join(' ')

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', scopes)
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')

  return NextResponse.redirect(url.toString())
}
