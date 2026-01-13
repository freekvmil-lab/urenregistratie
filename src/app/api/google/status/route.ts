import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  /* =========================
     1️⃣ Supabase admin client
  ========================= */
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  /* =========================
     2️⃣ Auth cookie ophalen
  ========================= */
  const cookieStore = await cookies()
  const authCookie = cookieStore
    .getAll()
    .find(
      (c) =>
        c.name.startsWith('sb-') &&
        c.name.endsWith('-auth-token')
    )

  if (!authCookie) {
    return NextResponse.json(
      { connected: false, error: 'not_authenticated' },
      { status: 401 }
    )
  }

  const session = JSON.parse(
    decodeURIComponent(authCookie.value)
  )

  const accessToken = session?.access_token

  if (!accessToken) {
    return NextResponse.json(
      { connected: false, error: 'no_token' },
      { status: 401 }
    )
  }

  /* =========================
     3️⃣ User ophalen
  ========================= */
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(accessToken)

  if (userError || !user) {
    return NextResponse.json(
      { connected: false, error: 'user_not_found' },
      { status: 401 }
    )
  }

  /* =========================
     4️⃣ Google account check
  ========================= */
  const { data } = await supabase
    .from('google_accounts')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  return NextResponse.json({
    connected: Boolean(data),
  })
}
