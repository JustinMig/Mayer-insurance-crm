import Link from 'next/link'
import { getCrmSession } from '@/lib/crm-session'
import { CRM_GMAIL_LABEL, gmailConfigured, syncCrmMail } from '@/lib/gmail-mail'
import MailCenterRefresh from './MailCenterRefresh'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const folders = ['Inbox', 'Medicare', 'Life', 'Commissions', 'Underwriting', 'Carrier Notices', 'Client Documents', 'Archived']

type SearchParams = Promise<{ folder?: string; connected?: string; setup?: string; gmail_error?: string }>

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

export default async function MailCenterPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const { supabase, userId } = await getCrmSession()
  const configured = gmailConfigured()
  const { data: connection } = await supabase.from('gmail_connections').select('gmail_email').eq('user_id', userId).maybeSingle()
  const connected = Boolean(connection)
  let labelMissing = false

  if (connected && configured) {
    try {
      const sync = await syncCrmMail(supabase, userId)
      labelMissing = sync.labelMissing
    } catch {
      // Keep the inbox usable even if Google is temporarily unavailable.
    }
  }

  const selectedFolder = folders.includes(params.folder || '') ? params.folder! : 'Inbox'
  let query = supabase.from('crm_mail')
    .select('id,sender_name,sender_email,subject,snippet,received_at,folder,read_at,archived_at')
    .eq('user_id', userId)
    .is('removed_at', null)
    .order('received_at', { ascending: false })
    .limit(100)

  if (selectedFolder === 'Archived') query = query.not('archived_at', 'is', null)
  else query = query.eq('folder', selectedFolder).is('archived_at', null)

  const [{ data: mail, error }, { count: unreadCount }] = await Promise.all([
    query,
    supabase.from('crm_mail').select('id', { count: 'exact', head: true }).eq('user_id', userId).is('read_at', null).is('removed_at', null).is('archived_at', null),
  ])
  if (error) throw new Error(error.message)

  return (
    <>
      <div className="clients-page-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <h1>MAIL CENTER</h1>
          <p className="subtle">Only Gmail messages you choose with the <strong>{CRM_GMAIL_LABEL}</strong> label are brought into the CRM.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {connected ? <MailCenterRefresh connected /> : null}
          {!connected && configured ? <a className="btn btn-primary" href="/api/gmail/connect">Connect Gmail</a> : null}
        </div>
      </div>

      {!configured && <div className="notice" style={{ marginTop: 16 }}>Gmail is ready in the CRM, but Google OAuth still needs 2 Vercel environment values before you can connect the mailbox.</div>}
      {params.connected === '1' && <div className="notice" style={{ marginTop: 16 }}>Gmail connected successfully.</div>}
      {params.gmail_error && <div className="notice" style={{ marginTop: 16 }}>Gmail connection did not complete. Try connecting again.</div>}
      {labelMissing && <div className="notice" style={{ marginTop: 16 }}>Create a Gmail label named <strong>{CRM_GMAIL_LABEL}</strong>. Add that label to any email you want to appear here. Gmail filters can apply it automatically to selected senders or subjects.</div>}

      <section className="card card-pad" style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div><span className="subtle">Connected mailbox</span><div style={{ fontWeight: 800, marginTop: 3 }}>{connection?.gmail_email || 'Not connected'}</div></div>
        <div><span className="subtle">Unread CRM mail</span><div style={{ fontSize: '1.45rem', fontWeight: 900, marginTop: 3 }}>{unreadCount || 0}</div></div>
      </section>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
        {folders.map(folder => <Link key={folder} prefetch={false} href={folder === 'Inbox' ? '/mail-center' : `/mail-center?folder=${encodeURIComponent(folder)}`} className={`btn ${selectedFolder === folder ? 'btn-primary' : 'btn-secondary'}`}>{folder}</Link>)}
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        {mail?.length ? (
          <div className="website-leads-list">
            {mail.map((message: any) => (
              <Link prefetch={false} href={`/mail-center/${message.id}`} key={message.id} className={`website-lead-row${message.read_at ? '' : ' is-new'}`}>
                <div className="website-lead-main">
                  <div className="website-lead-title">
                    <strong>{message.sender_name || message.sender_email || 'Unknown sender'}</strong>
                    {!message.read_at && <span className="website-lead-new-badge">NEW</span>}
                  </div>
                  <strong style={{ color: '#0f172a' }}>{message.subject}</strong>
                  {message.snippet && <span>{message.snippet}</span>}
                </div>
                <div className="website-lead-meta"><span>{formatDate(message.received_at)}</span><b>Open ›</b></div>
              </Link>
            ))}
          </div>
        ) : <div className="empty">No mail in {selectedFolder}.</div>}
      </section>
    </>
  )
}
