import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || ''
  const privateKey = process.env.VAPID_PRIVATE_KEY || process.env.NEXT_PUBLIC_VAPID_PRIVATE_KEY || ''

  return NextResponse.json({
    hasPublicKey: Boolean(publicKey),
    hasPrivateKey: Boolean(privateKey),
    publicKeyLength: publicKey ? publicKey.length : 0,
    privateKeyLength: privateKey ? privateKey.length : 0,
    publicKeyPrefix: publicKey ? publicKey.slice(0, 12) : null,
    privateKeyPrefix: privateKey ? privateKey.slice(0, 6) : null,
    note:
      'Als hasPrivateKey=false op Vercel: zet VAPID_PRIVATE_KEY in Vercel Environment Variables en redeploy. BadJwtToken betekent vaak private/public mismatch of private ontbreekt.',
  })
}
