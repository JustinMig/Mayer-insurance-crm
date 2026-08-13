import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const BUCKET = 'client-documents'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_BULK_DELETE = 250

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: claimsData } = await supabase.auth.getClaims()
    if (!claimsData?.claims) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 })

    const userId = String(claimsData.claims.sub)
    const { data: profile } = await supabase
      .from('profiles')
      .select('agency_id, role')
      .eq('id', userId)
      .maybeSingle()

    if (!profile?.agency_id || !['admin', 'manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Only an Admin or Manager can delete clients.' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    const clientIds: string[] = Array.isArray(body?.client_ids)
      ? Array.from(new Set<string>(body.client_ids.map((id: unknown) => String(id).trim()).filter(Boolean)))
      : []

    if (clientIds.length === 0) return NextResponse.json({ error: 'Select at least 1 client to delete.' }, { status: 400 })
    if (clientIds.length > MAX_BULK_DELETE) return NextResponse.json({ error: `A maximum of ${MAX_BULK_DELETE} clients can be deleted at once.` }, { status: 400 })
    if (clientIds.some((id) => !UUID_PATTERN.test(id))) return NextResponse.json({ error: 'One or more selected client IDs are invalid.' }, { status: 400 })

    const { data: clients, error: clientError } = await supabase
      .from('clients')
      .select('id, first_name, last_name')
      .eq('agency_id', profile.agency_id)
      .in('id', clientIds)

    if (clientError) return NextResponse.json({ error: clientError.message }, { status: 400 })
    if ((clients || []).length !== clientIds.length) {
      return NextResponse.json({ error: 'One or more selected clients were not found or are outside your agency. Nothing was deleted.' }, { status: 400 })
    }

    const { data: documents, error: documentError } = await supabase
      .from('documents')
      .select('client_id, storage_path')
      .eq('agency_id', profile.agency_id)
      .in('client_id', clientIds)

    if (documentError) return NextResponse.json({ error: `Unable to prepare file cleanup: ${documentError.message}` }, { status: 400 })

    const storagePaths = Array.from(new Set(
      (documents || [])
        .map((document: { storage_path: string | null }) => document.storage_path)
        .filter((path: string | null): path is string => Boolean(path))
    ))

    const { data: deletedClients, error: deleteError } = await supabase
      .from('clients')
      .delete()
      .eq('agency_id', profile.agency_id)
      .in('id', clientIds)
      .select('id')

    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 })
    if ((deletedClients || []).length !== clientIds.length) {
      return NextResponse.json({ error: 'The database did not confirm deletion of every selected client.' }, { status: 500 })
    }

    const storageWarnings: string[] = []
    for (let index = 0; index < storagePaths.length; index += 100) {
      const batch = storagePaths.slice(index, index + 100)
      const { error: storageError } = await supabase.storage.from(BUCKET).remove(batch)
      if (storageError) storageWarnings.push(storageError.message)
    }

    await supabase.from('audit_log').insert({
      agency_id: profile.agency_id,
      actor_id: userId,
      client_id: null,
      action: 'clients.bulk_deleted',
      details: {
        deleted_client_ids: clientIds,
        deleted_client_names: (clients || []).map((client: { first_name: string | null; last_name: string | null }) => `${client.first_name || ''} ${client.last_name || ''}`.trim()),
        deleted_count: clientIds.length,
        document_count: storagePaths.length,
        storage_cleanup_warning: storageWarnings.length ? storageWarnings.join(' | ') : null
      }
    })

    return NextResponse.json({
      deleted: true,
      deleted_count: clientIds.length,
      document_count: storagePaths.length,
      storage_warning: storageWarnings.length ? storageWarnings.join(' | ') : null
    }, {
      headers: { 'Cache-Control': 'private, no-store' }
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to delete selected clients.' }, { status: 500 })
  }
}
