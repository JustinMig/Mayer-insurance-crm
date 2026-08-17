import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { gmailAttachment } from '@/lib/gmail-mail'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const attachmentId = request.nextUrl.searchParams.get('attachmentId') || ''
  const filename = (request.nextUrl.searchParams.get('filename') || 'attachment').replace(/[\r\n"]/g, '')
  if (!attachmentId) return new NextResponse('Missing attachment', { status: 400 })

  const { supabase, userId } = await getCrmSession()
  const { data: message } = await supabase.from('crm_mail').select('gmail_message_id,attachments').eq('id', id).eq('user_id', userId).is('removed_at', null).maybeSingle()
  if (!message) return new NextResponse('Not found', { status: 404 })
  const listed = Array.isArray(message.attachments) && message.attachments.some((item: any) => item?.attachmentId === attachmentId)
  if (!listed) return new NextResponse('Not found', { status: 404 })

  const bytes = await gmailAttachment(supabase, userId, message.gmail_message_id, attachmentId)
  if (!bytes) return new NextResponse('Unable to load attachment', { status: 502 })

  return new NextResponse(bytes, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
