import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
const BUCKET = 'client-documents'

export async function GET(request: Request, context: { params: Promise<{ id: string; documentId: string }> }) {
  const { id: clientId, documentId } = await context.params
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'))

  const userId = String(claimsData.claims.sub)
  const { data: profile } = await supabase.from('profiles').select('agency_id').eq('id', userId).single()
  if (!profile?.agency_id) return new NextResponse('Access denied.', { status: 403 })

  const { data: document } = await supabase
    .from('documents')
    .select('id, client_id, storage_path, file_name, mime_type, document_type')
    .eq('id', documentId)
    .eq('client_id', clientId)
    .maybeSingle()
  if (!document) return new NextResponse('Document not found or access denied.', { status: 404 })

  const raw = new URL(request.url).searchParams.get('raw') === '1'
  if (raw) {
    const { data: downloaded, error: downloadError } = await supabase.storage.from(BUCKET).download(document.storage_path)
    if (downloadError || !downloaded) return new NextResponse(downloadError?.message || 'Could not open document.', { status: 400 })

    await supabase.from('audit_log').insert({
      agency_id: profile.agency_id,
      actor_id: userId,
      client_id: clientId,
      action: 'document.viewed',
      details: { document_id: document.id, document_type: document.document_type, file_name: document.file_name, raw: true }
    })

    return new NextResponse(await downloaded.arrayBuffer(), {
      status: 200,
      headers: {
        'Content-Type': document.mime_type || 'application/octet-stream',
        'Cache-Control': 'private, no-store',
        'Content-Disposition': `inline; filename="${String(document.file_name).replace(/["\r\n]/g, '_')}"`
      }
    })
  }

  const { data: signed, error } = await supabase.storage.from(BUCKET).createSignedUrl(document.storage_path, 90)
  if (error || !signed?.signedUrl) return new NextResponse(error?.message || 'Could not open document.', { status: 400 })

  await supabase.from('audit_log').insert({
    agency_id: profile.agency_id,
    actor_id: userId,
    client_id: clientId,
    action: 'document.viewed',
    details: { document_id: document.id, document_type: document.document_type, file_name: document.file_name }
  })

  return NextResponse.redirect(signed.signedUrl)
}
