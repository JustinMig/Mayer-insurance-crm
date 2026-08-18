import Link from 'next/link'
import { getCrmSession } from '@/lib/crm-session'
import { isJustinWebsiteLeadUser } from '@/lib/website-leads'
import { CRM_GMAIL_LABEL, gmailConfigured, syncCrmMail } from '@/lib/gmail-mail'
import MailCenterRefresh from '../mail-center/MailCenterRefresh'
import MessagesCenter from '../messages/MessagesCenter'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type SearchParams = Promise<{ tab?: string; connected?: string; gmail_error?: string; agent?: string }>

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

export default async function NotificationsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const { supabase, userId, profile } = await getCrmSession()
  const canUseMail = isJustinWebsiteLeadUser(userId)
  const requestedTab = params.tab === 'text' ? 'text' : 'mail'
  const activeTab = !canUseMail ? 'text' : requestedTab
  const rawAgent = params.agent
  const initialAgent = rawAgent === 'isaiah' ? 'isaiah' : rawAgent === 'justin' ? 'justin' : 'all'

  let mail: any[] = []
  let unreadMailCount = 0
  let connected = false
  let configured = false
  let labelMissing = false
  let gmailEmail = ''

  if (canUseMail) {
    configured = gmailConfigured()
    const { data: connection } = await supabase.from('gmail_connections').select('gmail_email').eq('user_id', userId).maybeSingle()
    connected = Boolean(connection)
    gmailEmail = connection?.gmail_email || ''

    if (connected && configured) {
      try {
        const sync = await syncCrmMail(supabase, userId)
        labelMissing = sync.labelMissing
      } catch {
        // Keep Notifications usable if Google is temporarily unavailable.
      }
    }

    const [{ data: mailRows, error }, { count }] = await Promise.all([
      supabase.from('crm_mail')
        .select('id,sender_name,sender_email,subject,snippet,received_at,read_at')
        .eq('user_id', userId)
        .is('removed_at', null)
        .is('archived_at', null)
        .order('received_at', { ascending: false })
        .limit(100),
      supabase.from('crm_mail')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('read_at', null)
        .is('removed_at', null)
        .is('archived_at', null)
    ])
    if (error) throw new Error(error.message)
    mail = mailRows || []
    unreadMailCount = count || 0
  }

  return (
    <>
      <div className="clients-page-heading">
        <h1>Notifications</h1>
        <p className="subtle">Mail and client text messages in one place.</p>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
        {canUseMail && (
          <Link prefetch={false} href="/notifications?tab=mail" className={`btn ${activeTab === 'mail' ? 'btn-primary' : 'btn-secondary'}`}>
            MAIL{unreadMailCount > 0 ? ` (${unreadMailCount})` : ''}
          </Link>
        )}
        <Link prefetch={false} href="/notifications?tab=text" className={`btn ${activeTab === 'text' ? 'btn-primary' : 'btn-secondary'}`}>TEXT MESSAGES</Link>
      </div>

      {activeTab === 'mail' && canUseMail ? (
        <>
          <section className="card card-pad" style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <span className="subtle">Connected mailbox</span>
              <div style={{ fontWeight: 800, marginTop: 3 }}>{gmailEmail || 'Not connected'}</div>
              <p className="subtle" style={{ margin: '5px 0 0' }}>Gmail messages labeled <strong>{CRM_GMAIL_LABEL}</strong> appear here.</p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center', minWidth: 62 }}><div style={{ fontSize: '1.45rem', fontWeight: 900 }}>{unreadMailCount}</div><span className="subtle">unread</span></div>
              {connected ? <MailCenterRefresh connected /> : null}
              {!connected && configured ? <a className="btn btn-primary" href="/api/gmail/connect">Connect Gmail</a> : null}
            </div>
          </section>

          {!configured && <div className="notice" style={{ marginTop: 16 }}>Gmail needs its Google OAuth environment values before the mailbox can connect.</div>}
          {params.connected === '1' && <div className="notice" style={{ marginTop: 16 }}>Gmail connected successfully.</div>}
          {params.gmail_error && <div className="notice" style={{ marginTop: 16 }}>Gmail connection did not complete. Try connecting again.</div>}
          {labelMissing && <div className="notice" style={{ marginTop: 16 }}>Create a Gmail label named <strong>{CRM_GMAIL_LABEL}</strong> and apply it to messages you want in the CRM.</div>}

          <section className="card" style={{ marginTop: 16 }}>
            {mail.length ? (
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
            ) : <div className="empty">No CRM mail yet.</div>}
          </section>
        </>
      ) : (
        <div style={{ marginTop: 18 }}>
          <MessagesCenter viewerName={profile?.full_name || ''} initialAgent={initialAgent} />
        </div>
      )}
    </>
  )
}
