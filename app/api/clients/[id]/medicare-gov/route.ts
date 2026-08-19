import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { decryptValue, encryptValue } from '@/lib/crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>
type CredentialField = 'username' | 'password' | 'secret_answer' | 'security_code_destination_name'

const fieldToColumn: Record<CredentialField, string> = {
  username: 'medicare_gov_username_ciphertext',
  password: 'medicare_gov_password_ciphertext',
  secret_answer: 'medicare_gov_secret_answer_ciphertext',
  security_code_destination_name: 'medicare_gov_security_code_destination_ciphertext'
}

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

function clean(value: unknown, max = 500) {
  return String(value || '').trim().slice(0, max)
}

async function assertClientAccess(clientId: string) {
  const session = await getCrmSession()
  if (!session.profile?.agency_id) throw new Error('Not authorized.')

  const { data: client, error } = await session.supabase
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .eq('agency_id', session.profile.agency_id)
    .maybeSingle()

  if (error || !client) throw new Error('Client not found or access denied.')
  return session
}

export async function GET(_request: NextRequest, { params }: { params: Params }) {
  try {
    const { id: clientId } = await params
    const { supabase } = await assertClientAccess(clientId)

    const { data, error } = await supabase
      .from('medicare_info')
      .select('medicare_gov_username_ciphertext,medicare_gov_password_ciphertext,medicare_gov_secret_answer_ciphertext,medicare_gov_security_code_destination_ciphertext')
      .eq('client_id', clientId)
      .maybeSingle()

    if (error) return noStoreJson({ error: 'Unable to load Medicare.gov information.' }, 400)

    return noStoreJson({
      saved: {
        username: Boolean(data?.medicare_gov_username_ciphertext),
        password: Boolean(data?.medicare_gov_password_ciphertext),
        secret_answer: Boolean(data?.medicare_gov_secret_answer_ciphertext),
        security_code_destination_name: Boolean(data?.medicare_gov_security_code_destination_ciphertext)
      }
    })
  } catch (error) {
    return noStoreJson({ error: error instanceof Error ? error.message : 'Unable to load Medicare.gov information.' }, 403)
  }
}

export async function POST(request: NextRequest, { params }: { params: Params }) {
  try {
    const { id: clientId } = await params
    const { supabase, userId, profile } = await assertClientAccess(clientId)
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const action = clean(body.action, 20).toLowerCase()

    if (action === 'reveal') {
      const field = clean(body.field, 80) as CredentialField
      if (!(field in fieldToColumn)) return noStoreJson({ error: 'Unknown Medicare.gov field.' }, 400)

      const column = fieldToColumn[field]
      const { data, error } = await supabase
        .from('medicare_info')
        .select(`${column}`)
        .eq('client_id', clientId)
        .maybeSingle()

      if (error) return noStoreJson({ error: 'Unable to access Medicare.gov information.' }, 403)
      const ciphertext = data?.[column as keyof typeof data] as string | null | undefined
      if (!ciphertext) return noStoreJson({ value: null })

      const value = decryptValue(ciphertext)
      await supabase.from('audit_log').insert({
        agency_id: profile.agency_id,
        actor_id: userId,
        client_id: clientId,
        action: 'sensitive.revealed',
        details: { field: `medicare_gov_${field}` }
      })

      return noStoreJson({ value })
    }

    if (action !== 'save') return noStoreJson({ error: 'Unknown action.' }, 400)

    const { data: current, error: currentError } = await supabase
      .from('medicare_info')
      .select('id,medicare_gov_username_ciphertext,medicare_gov_password_ciphertext,medicare_gov_secret_answer_ciphertext,medicare_gov_security_code_destination_ciphertext')
      .eq('client_id', clientId)
      .maybeSingle()

    if (currentError) return noStoreJson({ error: 'Unable to access Medicare.gov information.' }, 400)

    const next: Record<string, string | null> = {
      medicare_gov_username_ciphertext: current?.medicare_gov_username_ciphertext ?? null,
      medicare_gov_password_ciphertext: current?.medicare_gov_password_ciphertext ?? null,
      medicare_gov_secret_answer_ciphertext: current?.medicare_gov_secret_answer_ciphertext ?? null,
      medicare_gov_security_code_destination_ciphertext: current?.medicare_gov_security_code_destination_ciphertext ?? null
    }

    const changedFields: string[] = []
    const inputMap: Array<[CredentialField, string, number]> = [
      ['username', 'username', 300],
      ['password', 'password', 500],
      ['secret_answer', 'secret_answer', 500],
      ['security_code_destination_name', 'security_code_destination_name', 500]
    ]

    for (const [field, inputKey, max] of inputMap) {
      const column = fieldToColumn[field]
      const clearFlag = Boolean(body[`clear_${inputKey}`])
      const incoming = clean(body[inputKey], max)
      if (clearFlag) {
        next[column] = null
        changedFields.push(field)
      } else if (incoming) {
        next[column] = encryptValue(incoming)
        changedFields.push(field)
      }
    }

    if (current) {
      const { error } = await supabase
        .from('medicare_info')
        .update(next)
        .eq('client_id', clientId)
      if (error) return noStoreJson({ error: 'Unable to save Medicare.gov information.' }, 400)
    } else if (Object.values(next).some(Boolean)) {
      const { error } = await supabase.from('medicare_info').insert({
        agency_id: profile.agency_id,
        client_id: clientId,
        ...next
      })
      if (error) return noStoreJson({ error: 'Unable to save Medicare.gov information.' }, 400)
    }

    if (changedFields.length) {
      await supabase.from('audit_log').insert({
        agency_id: profile.agency_id,
        actor_id: userId,
        client_id: clientId,
        action: 'medicare_gov.credentials_updated',
        details: { fields: changedFields }
      })
    }

    return noStoreJson({ ok: true })
  } catch (error) {
    return noStoreJson({ error: error instanceof Error ? error.message : 'Unable to save Medicare.gov information.' }, 400)
  }
}
