import { NextResponse } from 'next/server'
import { p256 } from '@noble/curves/nist.js'

export const runtime = 'nodejs'

const base64UrlToBytes = (s: string) => {
  const base64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  return new Uint8Array(Buffer.from(padded, 'base64'))
}

const bytesToBase64Url = (bytes: Uint8Array) =>
  Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')

export async function GET() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || ''
  const privateKey = process.env.VAPID_PRIVATE_KEY || process.env.NEXT_PUBLIC_VAPID_PRIVATE_KEY || ''

  let derivedPublicKey: string | null = null
  let publicKeyMatchesPrivateKey: boolean | null = null
  let deriveError: string | null = null

  if (publicKey && privateKey) {
    try {
      const privBytes = base64UrlToBytes(privateKey)
      // VAPID private key is a 32-byte scalar
      if (privBytes.length !== 32) throw new Error(`Private key heeft ${privBytes.length} bytes (verwacht 32)`) 

      const pubBytes = p256.getPublicKey(privBytes, false) // uncompressed: 65 bytes (0x04 + X + Y)
      derivedPublicKey = bytesToBase64Url(pubBytes)
      publicKeyMatchesPrivateKey = derivedPublicKey === publicKey
    } catch (e: any) {
      deriveError = e?.message || 'Kon public key niet afleiden uit private key'
      publicKeyMatchesPrivateKey = null
    }
  }

  return NextResponse.json({
    hasPublicKey: Boolean(publicKey),
    hasPrivateKey: Boolean(privateKey),
    publicKeyLength: publicKey ? publicKey.length : 0,
    privateKeyLength: privateKey ? privateKey.length : 0,
    publicKeyPrefix: publicKey ? publicKey.slice(0, 12) : null,
    privateKeyPrefix: privateKey ? privateKey.slice(0, 6) : null,
    publicKeyMatchesPrivateKey,
    derivedPublicKeyPrefix: derivedPublicKey ? derivedPublicKey.slice(0, 12) : null,
    deriveError,
    note:
      'Als hasPrivateKey=false op Vercel: zet VAPID_PRIVATE_KEY in Vercel Environment Variables en redeploy. BadJwtToken betekent vaak private/public mismatch of private ontbreekt.',
  })
}
