import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function GET() {
  const cookieStore = await cookies()

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // server only
  )

  // 1️⃣ Zoek Supabase auth cookie
  const authCookie = cookieStore
    .getAll()
    .find(
      (c) =>
        c.name.startsWith('sb-') &&
        c.name.endsWith('-auth-token')
    )

  if (!authCookie) {
    return NextResponse.json({ connected: false })
  }

  // 2️⃣ Parse cookie JSON
  let session: any
  try {
    session = JSON.parse(decodeURIComponent(authCookie.value))
  } catch {
    return NextResponse.json({ connected: false })
  }
console.log('STATUS session user id:', session?.user?.id)

  const accessToken = session?.access_token
  if (!accessToken) {
    return NextResponse.json({ connected: false })
  }

  // 3️⃣ Haal user op
  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(accessToken)

  if (error || !user) {
    return NextResponse.json({ connected: false })
  }
console.log('STATUS auth user id:', user?.id)

  // 4️⃣ Check google_accounts
  const { data } = await supabaseAdmin
    .from('google_accounts')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  return NextResponse.json({
    connected: !!data,
  })
}
