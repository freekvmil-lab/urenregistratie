import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function GET() {
  const cookieStore = await cookies()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 🔍 Supabase auth cookie zoeken
  const authCookie = cookieStore
    .getAll()
    .find(
      (c: { name: string; value: string }) =>
        c.name.startsWith('sb-') &&
        c.name.endsWith('-auth-token')
    )

  if (!authCookie) {
    return NextResponse.json({ connected: false })
  }

  // 🔑 cookie JSON parsen → access_token eruit halen
  let accessToken: string | undefined
  try {
    const session = JSON.parse(
      decodeURIComponent(authCookie.value)
    )
    accessToken = session?.access_token
  } catch {
    return NextResponse.json({ connected: false })
  }

  if (!accessToken) {
    return NextResponse.json({ connected: false })
  }

  // 👤 User ophalen
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken)

  if (error || !user) {
    return NextResponse.json({ connected: false })
  }

  // 📅 Check of Google account bestaat
  const { data } = await supabase
    .from('google_accounts')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  return NextResponse.json({
    connected: !!data,
  })
}
