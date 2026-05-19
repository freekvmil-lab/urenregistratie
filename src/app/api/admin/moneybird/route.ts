import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const MONEYBIRD_TOKEN = process.env.MONEYBIRD_TOKEN!
const MONEYBIRD_ADMIN_ID = process.env.MONEYBIRD_ADMIN_ID!

const getServiceClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://shxlihgfdzfxwjewjnmj.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function mbFetch(path: string, method = 'GET', body?: object) {
  const res = await fetch(`https://moneybird.com/api/v2/${MONEYBIRD_ADMIN_ID}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${MONEYBIRD_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}

export async function POST(req: NextRequest) {
  try {
    const { entry_ids, contact_id, contact_naam, maand, jaar } = await req.json()
    const supabase = getServiceClient()

    // Haal uren op
    const { data: entries } = await supabase
      .from('time_entries')
      .select('*, profiles(name, email)')
      .in('id', entry_ids)

    if (!entries?.length) {
      return NextResponse.json({ error: 'Geen uren gevonden' }, { status: 400 })
    }

    // Bereken totaal uren per medewerker
    const perMedewerker: Record<string, { naam: string; uren: number }> = {}
    for (const e of entries) {
      if (!e.start_time || !e.end_time) continue
      const start = new Date(e.date + 'T' + e.start_time)
      const end = new Date(e.date + 'T' + e.end_time)
      const uren = (end.getTime() - start.getTime()) / 3600000
      const naam = (e.profiles as { name: string })?.name ?? e.user_id
      if (!perMedewerker[e.user_id]) perMedewerker[e.user_id] = { naam, uren: 0 }
      perMedewerker[e.user_id].uren += uren
    }

    const maandNamen = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december']
    const maandNaam = maandNamen[(maand ?? 1) - 1]

    // Bouw factuurregels
    const details_attributes = Object.values(perMedewerker).map(m => ({
      description: `Diensten ${m.naam} - ${maandNaam} ${jaar}`,
      price: '0.00',
      amount: m.uren.toFixed(2),
      tax_rate_id: null,
      ledger_account_id: null,
    }))

    // Maak concept factuur in Moneybird
    const factuur = await mbFetch('sales_invoices', 'POST', {
      sales_invoice: {
        contact_id: contact_id ?? null,
        reference: `Diensten ${maandNaam} ${jaar}`,
        details_attributes,
      }
    })

    if (factuur.error || !factuur.id) {
      return NextResponse.json({ error: 'Moneybird fout', details: factuur }, { status: 400 })
    }

    // Markeer uren als goedgekeurd
    await supabase.from('time_entries')
      .update({ approved: true, approved_at: new Date().toISOString() })
      .in('id', entry_ids)

    return NextResponse.json({
      ok: true,
      factuur_id: factuur.id,
      factuur_url: `https://moneybird.com/${MONEYBIRD_ADMIN_ID}/sales_invoices/${factuur.id}`,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// Haal Moneybird contacten op
export async function GET() {
  try {
    const contacten = await mbFetch('contacts?query=&per_page=100')
    return NextResponse.json({ contacten: Array.isArray(contacten) ? contacten : [] })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
