import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.json({ error: 'No code' }, { status: 400 })
  }

  // voorlopig alleen testen
  console.log('✅ Google auth code ontvangen:', code)

  return NextResponse.redirect(
    new URL('/?google=connected', req.url)
  )
}
