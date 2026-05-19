import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const getServiceClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://shxlihgfdzfxwjewjnmj.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Maak overeenkomst aan
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { planning_id, zzp_id, tarief, tarief_type, notities } = body
    const supabase = getServiceClient()

    // Haal ZZP profiel op
    const { data: profiel } = await supabase
      .from('profiles')
      .select('id, name, email, home_address, bsn, iban, hourly_rate')
      .eq('id', zzp_id)
      .single()

    // Haal planning op
    const { data: planning } = await supabase
      .from('planning')
      .select('*')
      .eq('id', planning_id)
      .single()

    if (!profiel || !planning) {
      return NextResponse.json({ error: 'Profiel of planning niet gevonden' }, { status: 404 })
    }

    const { data: overeenkomst, error } = await supabase
      .from('overeenkomsten')
      .insert({
        planning_id,
        zzp_id,
        zzp_naam: profiel.name,
        zzp_email: profiel.email,
        zzp_adres: profiel.home_address,
        zzp_iban: profiel.iban,
        opdracht_omschrijving: `${planning.titel}${planning.opdrachtgever_naam ? ' voor ' + planning.opdrachtgever_naam : ''}`,
        locatie: planning.locatie,
        datum_van: planning.datum,
        datum_tot: planning.datum,
        tarief: tarief ?? profiel.hourly_rate,
        tarief_type: tarief_type ?? 'uur',
        status: 'verstuurd',
        notities,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true, overeenkomst_id: overeenkomst.id })
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// Teken overeenkomst
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { overeenkomst_id, actie } = body // actie: 'teken' | 'weiger'
    const supabase = getServiceClient()

    const forwarded = req.headers.get('x-forwarded-for')
    const ip = forwarded ? forwarded.split(',')[0] : 'onbekend'

    if (actie === 'teken') {
      await supabase.from('overeenkomsten').update({
        status: 'getekend',
        getekend_op: new Date().toISOString(),
        getekend_ip: ip,
      }).eq('id', overeenkomst_id)
    } else {
      await supabase.from('overeenkomsten').update({ status: 'geweigerd' }).eq('id', overeenkomst_id)
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// Haal overeenkomsten op
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const zzp_id = searchParams.get('zzp_id')
    const supabase = getServiceClient()

    let query = supabase.from('overeenkomsten').select('*').order('created_at', { ascending: false })
    if (zzp_id) query = query.eq('zzp_id', zzp_id)

    const { data } = await query
    return NextResponse.json({ overeenkomsten: data ?? [] })
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
