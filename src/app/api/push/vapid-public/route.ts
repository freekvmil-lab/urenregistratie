import { NextResponse } from 'next/server'

export async function GET() {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY

  if (!key) {
    return NextResponse.json(
      {
        error:
          'VAPID public key ontbreekt. Zet NEXT_PUBLIC_VAPID_PUBLIC_KEY (of VAPID_PUBLIC_KEY) in je environment.',
      },
      { status: 500 }
    )
  }

  return NextResponse.json({ publicKey: key })
}
