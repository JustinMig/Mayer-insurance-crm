import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getCrmSession } from '@/lib/crm-session'
import { isJustinWebsiteLeadUser } from '@/lib/website-leads'
import { archiveMail, moveMail, removeMail } from '../actions'
import EmailBodyFrame from './EmailBodyFrame'

export const dynamic = 'force-dynamic'

const folders = ['Inbox', 'Medicare', 'Life', 'Commissions', 'Underwriting', 'Carrier Notices', 'Client Documents']

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function attachmentSize(value: unknown) {
  const size = Number(value || 0)
  if (!Number.isFinite(size) || size <= 0) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
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
  const sender = message.sender_name
    ? `${message.sender_name}${message.sender_email ? ` <${message.sender_email}>` : ''}`
    : (message.sender_email || 'Unknown sender')

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <Link prefetch={false} href="/mail-center" className="btn btn-secondary">Back to Mail</Link>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <form action={archiveMail}><input type="hidden" name="id" value={id} /><button className="btn btn-secondary" type="submit">Archive</button></form>
          <form action={removeMail}><input type="hidden" name="id" value={id} /><button className="btn btn-secondary" type="submit">Remove from CRM</button></form>
        </div>
      </div>

      <section className="card" style={{ marginTop: 16, overflow: 'hidden' }}>
        <div style={{ padding: '20px 22px 16px', borderBottom: '1px solid #e2e8f0' }}>
          <h1 style={{ margin: '0 0 16px', fontSize: '1.65rem', lineHeight: 1.25 }}>{message.subject || '(no subject)'}</h1>

          <div style={{ display: 'grid', gap: 7, fontSize: '.94rem' }}>
            <div><strong>From:</strong> {sender}</div>
            {message.recipients ? <div><strong>To:</strong> {message.recipients}</div> : null}
            {message.cc ? <div><strong>Cc:</strong> {message.cc}</div> : null}
            {message.reply_to ? <div><strong>Reply-To:</strong> {message.reply_to}</div> : null}
            <div><strong>Date:</strong> {message.message_date || formatDate(message.received_at)}</div>
            <div className="subtle"><strong>CRM received:</strong> {formatDate(message.received_at)}</div>
          </div>
        </div>

        <div style={{ padding: '14px 22px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
          <form action={moveMail} style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
            <input type="hidden" name="id" value={id} />
            <label style={{ display: 'grid', gap: 5 }}><span className="subtle">Folder</span><select name="folder" defaultValue={message.folder}>{folders.map(folder => <option key={folder}>{folder}</option>)}</select></label>
            <button className="btn btn-secondary" type="submit">Move</button>
          </form>
        </div>

        <div style={{ background: '#fff' }}>
          {message.body_html ? (
            <EmailBodyFrame html={message.body_html} />
          ) : (
            <div style={{ padding: 22, whiteSpace: 'pre-wrap', lineHeight: 1.65, overflowWrap: 'anywhere' }}>{message.body_text || message.snippet || 'No message body available.'}</div>
          )}
        </div>

        {attachments.length > 0 && (
          <div style={{ padding: '18px 22px 22px', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
            <h2 style={{ fontSize: '1.05rem', margin: '0 0 12px' }}>Attachments ({attachments.length})</h2>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {attachments.map((attachment: any, index: number) => (
                <a
                  key={`${attachment.attachmentId}-${index}`}
                  className="btn btn-secondary"
                  href={`/api/mail-center/${id}/attachment?attachmentId=${encodeURIComponent(attachment.attachmentId)}&filename=${encodeURIComponent(attachment.filename || 'attachment')}`}
                  style={{ display: 'inline-flex', gap: 7, alignItems: 'center' }}
                >
                  <span>{attachment.filename || 'Attachment'}</span>
                  {attachmentSize(attachment.size) ? <small className="subtle">{attachmentSize(attachment.size)}</small> : null}
                </a>
              ))}
            </div>
          </div>
        )}
      </section>
    </>
  )
}
