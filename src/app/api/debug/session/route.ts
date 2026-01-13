import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const all = cookieStore.getAll()
    const names = all.map((c) => c.name)

    const authCookie = all.find(
      (c) => c.name.startsWith('sb-') && c.name.endsWith('-auth-token')
    )

    return NextResponse.json({
      cookies: names,
      hasSupabaseCookie: !!authCookie,
    })
  } catch (e: any) {
    return NextResponse.json({ error: 'debug_error' }, { status: 500 })
  }
}
