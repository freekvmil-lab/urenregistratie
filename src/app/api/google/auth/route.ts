import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  try {
    const { searchParams, origin } = new URL(req.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      console.error('No userId provided to google auth')
      return NextResponse.redirect(`${origin}/login`)
    }

    const clientId = process.env.GOOGLE_CLIENT_ID
    const redirectUri = process.env.GOOGLE_REDIRECT_URI

    if (!clientId || !redirectUri) {
      console.error('Missing Google env vars', {
        clientId,
        redirectUri,
      })
      return NextResponse.json(
        { error: 'Google OAuth not configured' },
        { status: 500 }
      )
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/calendar.readonly',
      access_type: 'offline',
      prompt: 'consent',
      state: userId, // 🔑
    })

    const url =
      'https://accounts.google.com/o/oauth2/v2/auth?' +
      params.toString()

    return NextResponse.redirect(url)
  } catch (err) {
    console.error('Google auth route crash:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
