import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const authHeader = req.headers.get('cookie') ?? ''
  const {
    data: { user },
  } = await supabase.auth.getUser(authHeader)

  if (!user) {
    return NextResponse.json({ connected: false })
  }

  const { data } = await supabase
    .from('google_accounts')
    .select('id')
    .eq('user_id', user.id)
    .single()

  return NextResponse.json({
    connected: !!data,
  })
}
