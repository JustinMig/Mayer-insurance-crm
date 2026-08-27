import { NextResponse } from 'next/server'
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

export async function GET(_request: Request, { params }: { params: Params }) {
  try {
    const { id: clientId } = await params
    const { supabase, profile } = await getCrmSession()
    if (!profile?.agency_id) return noStoreJson({ error: 'Not authorized.' }, 403)

    const [clientResult, medicareResult] = await Promise.all([
      supabase
        .from('clients')
        .select('id,is_deceased')
        .eq('id', clientId)
        .eq('agency_id', profile.agency_id)
        .maybeSingle(),
      supabase
        .from('medicare_info')
        .select('medicare_gov_username_ciphertext,medicare_gov_password_ciphertext,medicare_gov_secret_answer_ciphertext,medicare_gov_security_code_destination_ciphertext')
        .eq('client_id', clientId)
        .maybeSingle()
    ])

    if (clientResult.error || !clientResult.data) {
      return noStoreJson({ error: 'Client not found or access denied.' }, 404)
    }
    if (medicareResult.error) {
      return noStoreJson({ error: 'Unable to load Medicare.gov information.' }, 403)
    }

    const medicare = medicareResult.data
    return noStoreJson({
      is_deceased: Boolean(clientResult.data.is_deceased),
      medicare_gov: {
        values: {
          username: medicare?.medicare_gov_username_ciphertext ? decryptValue(medicare.medicare_gov_username_ciphertext) || '' : '',
          password: medicare?.medicare_gov_password_ciphertext ? decryptValue(medicare.medicare_gov_password_ciphertext) || '' : ''
        },
        saved: {
          username: Boolean(medicare?.medicare_gov_username_ciphertext),
          password: Boolean(medicare?.medicare_gov_password_ciphertext),
          secret_answer: Boolean(medicare?.medicare_gov_secret_answer_ciphertext),
          security_code_destination_name: Boolean(medicare?.medicare_gov_security_code_destination_ciphertext)
        }
      }
    })
  } catch (error) {
    return noStoreJson({ error: error instanceof Error ? error.message : 'Unable to load client record helpers.' }, 500)
  }
}
