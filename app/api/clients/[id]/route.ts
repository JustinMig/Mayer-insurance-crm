import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
const BUCKET = 'client-documents'

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: clientId } = await context.params
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
      return NextResponse.json({ error: 'Only an Admin or Manager can delete a client.' }, { status: 403 })
    }

    const { data: client } = await supabase
      .from('clients')
      .select('id, first_name, last_name')
      .eq('id', clientId)
      .maybeSingle()

    if (!client) return NextResponse.json({ error: 'Client not found or access denied.' }, { status: 404 })

    const { data: documents, error: documentError } = await supabase
      .from('documents')
      .select('storage_path')
      .eq('client_id', clientId)

    if (documentError) return NextResponse.json({ error: `Unable to prepare file cleanup: ${documentError.message}` }, { status: 400 })

    const storagePaths = (documents || [])
      .map((document: { storage_path: string | null }) => document.storage_path)
      .filter((path: string | null): path is string => Boolean(path))

    const { error: deleteError } = await supabase.from('clients').delete().eq('id', clientId)
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 })

    let storageWarning = ''
    if (storagePaths.length) {
      const { error: storageError } = await supabase.storage.from(BUCKET).remove(storagePaths)
      if (storageError) storageWarning = storageError.message
    }

    await supabase.from('audit_log').insert({
      agency_id: profile.agency_id,
      actor_id: userId,
      client_id: null,
      action: 'client.deleted',
      details: {
        deleted_client_id: clientId,
        client_name: `${client.first_name || ''} ${client.last_name || ''}`.trim(),
        document_count: storagePaths.length,
        storage_cleanup_warning: storageWarning || null
      }
    })

    return NextResponse.json({ deleted: true, storage_warning: storageWarning || null }, {
      headers: { 'Cache-Control': 'private, no-store' }
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to delete client.' }, { status: 500 })
  }
}
