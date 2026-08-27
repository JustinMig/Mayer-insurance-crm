import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { decryptValue } from '@/lib/crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      Pragma: 'no-cache',
      Expires: '0',
      'X-Content-Type-Options': 'nosniff'
    }
  })
}

export async function GET(_request: NextRequest, { params }: { params: Params }) {
  try {
    const { id: clientId } = await params
    const { supabase, profile } = await getCrmSession()
    if (!profile?.agency_id) return noStoreJson({ error: 'Not authorized.' }, 403)

    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .eq('agency_id', profile.agency_id)
      .maybeSingle()

    if (clientError || !client) return noStoreJson({ error: 'Client not found or access denied.' }, 404)

    const { data, error } = await supabase
      .from('medicare_info')
      .select('medicare_number_ciphertext,medicaid_number_ciphertext')
      .eq('client_id', clientId)
      .maybeSingle()

    if (error) return noStoreJson({ error: 'Unable to load Medicare information.' }, 400)

    return noStoreJson({
      medicare_number: data?.medicare_number_ciphertext ? decryptValue(data.medicare_number_ciphertext) : '',
      medicaid_number: data?.medicaid_number_ciphertext ? decryptValue(data.medicaid_number_ciphertext) : ''
    })
  } catch (error) {
    return noStoreJson({ error: error instanceof Error ? error.message : 'Unable to load Medicare information.' }, 400)
  }
}
