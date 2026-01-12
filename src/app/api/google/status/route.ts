import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function GET() {
  // ✅ cookies() is async in nieuwe Next.js
  const cookieStore = await cookies()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // ✅ Type-safe, async-correct
  const accessToken = cookieStore
    .getAll()
    .find(
      (c) =>
        c.name.startsWith('sb-') &&
        c.name.endsWith('-auth-token')
    )?.value

  if (!accessToken) {
    return NextResponse.json({ connected: false })
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken)

  if (error || !user) {
    return NextResponse.json({ connected: false })
  }

  const { data } = await supabase
    .from('google_accounts')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  return NextResponse.json({
    connected: !!data,
  })
}
