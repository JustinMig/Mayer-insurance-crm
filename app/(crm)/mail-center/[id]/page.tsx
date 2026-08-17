import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getCrmSession } from '@/lib/crm-session'
import { isJustinWebsiteLeadUser } from '@/lib/website-leads'
import { archiveMail, moveMail, removeMail } from '../actions'

export const dynamic = 'force-dynamic'

const folders = ['Inbox', 'Medicare', 'Life', 'Commissions', 'Underwriting', 'Carrier Notices', 'Client Documents']

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export default async function MailMessagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, userId } = await getCrmSession()
  if (!isJustinWebsiteLeadUser(userId)) notFound()

  const { data: message } = await supabase.from('crm_mail').select('*').eq('id', id).eq('user_id', userId).is('removed_at', null).maybeSingle()
  if (!message) notFound()
  if (!message.read_at) {
    await supabase.from('crm_mail').update({ read_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId)
  }
  const attachments = Array.isArray(message.attachments) ? message.attachments : []

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <Link prefetch={false} href="/mail-center" className="btn btn-secondary">Back to Mail</Link>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <form action={archiveMail}><input type="hidden" name="id" value={id} /><button className="btn btn-secondary" type="submit">Archive</button></form>
          <form action={removeMail}><input type="hidden" name="id" value={id} /><button className="btn btn-secondary" type="submit">Remove from CRM</button></form>
        </div>
      </div>

      <section className="card card-pad" style={{ marginTop: 16 }}>
        <span className="subtle">{formatDate(message.received_at)}</span>
        <h1 style={{ margin: '6px 0 14px', fontSize: '1.6rem' }}>{message.subject}</h1>
        <div style={{ display: 'grid', gap: 5, marginBottom: 18 }}>
          <div><strong>From:</strong> {message.sender_name ? `${message.sender_name} <${message.sender_email || ''}>` : message.sender_email}</div>
          {message.recipients && <div><strong>To:</strong> {message.recipients}</div>}
        </div>

        <form action={moveMail} style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap', marginBottom: 20 }}>
          <input type="hidden" name="id" value={id} />
          <label style={{ display: 'grid', gap: 5 }}><span className="subtle">Folder</span><select name="folder" defaultValue={message.folder}>{folders.map(folder => <option key={folder}>{folder}</option>)}</select></label>
          <button className="btn btn-secondary" type="submit">Move</button>
        </form>

        <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, overflowWrap: 'anywhere' }}>{message.body_text || message.snippet || 'No text body available.'}</div>

        {attachments.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <h2 style={{ fontSize: '1.05rem' }}>Attachments</h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {attachments.map((attachment: any, index: number) => (
                <a key={`${attachment.attachmentId}-${index}`} className="btn btn-secondary" href={`/api/mail-center/${id}/attachment?attachmentId=${encodeURIComponent(attachment.attachmentId)}&filename=${encodeURIComponent(attachment.filename || 'attachment')}`}>
                  {attachment.filename || 'Attachment'}
                </a>
              ))}
            </div>
          </div>
        )}
      </section>
    </>
  )
}
