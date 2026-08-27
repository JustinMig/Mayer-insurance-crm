import Link from 'next/link'
import { getCrmSession } from '@/lib/crm-session'
import { interestList, isJustinWebsiteLeadUser, type WebsiteLead } from '@/lib/website-leads'
import { CRM_GMAIL_LABEL, gmailConfigured } from '@/lib/gmail-mail'
import MailCenterRefresh from '../mail-center/MailCenterRefresh'
import MessagesCenter from '../messages/MessagesCenter'
import NotificationsMailList from './NotificationsMailList'
import styles from './Notifications.module.css'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type SearchParams = Promise<{ tab?: string; connected?: string; gmail_error?: string; agent?: string; deleted?: string }>

type MailRow = {
  id: string
  sender_name: string | null
  sender_email: string | null
  subject: string | null
  snippet: string | null
  received_at: string
  read_at: string | null
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

export default async function NotificationsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const { supabase, userId, profile } = await getCrmSession()
  const canUseMailAndForms = isJustinWebsiteLeadUser(userId)
  const requestedTab = params.tab === 'text' ? 'text' : params.tab === 'forms' ? 'forms' : 'mail'
  const activeTab = !canUseMailAndForms && requestedTab !== 'text' ? 'text' : requestedTab
  const rawAgent = params.agent
  const initialAgent = rawAgent === 'isaiah' ? 'isaiah' : rawAgent === 'justin' ? 'justin' : 'all'

  let mail: MailRow[] = []
  let unreadMailCount = 0
  let connected = false
  let configured = false
  let gmailEmail = ''
  let forms: WebsiteLead[] = []
  let unreadFormsCount = 0

  if (canUseMailAndForms) {
    const [mailUnreadResult, formsUnreadResult] = await Promise.all([
      supabase.from('crm_mail')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('read_at', null)
        .is('removed_at', null)
        .is('archived_at', null),
      supabase.from('website_leads')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_agent_id', userId)
        .is('read_at', null)
    ])
    unreadMailCount = mailUnreadResult.count || 0
    unreadFormsCount = formsUnreadResult.count || 0

    if (activeTab === 'mail') {
      configured = gmailConfigured()
      const [connectionResult, mailResult] = await Promise.all([
        supabase.from('gmail_connections').select('gmail_email').eq('user_id', userId).maybeSingle(),
        supabase.from('crm_mail')
          .select('id,sender_name,sender_email,subject,snippet,received_at,read_at')
          .eq('user_id', userId)
          .is('removed_at', null)
          .is('archived_at', null)
          .order('received_at', { ascending: false })
          .limit(100)
      ])
      if (mailResult.error) throw new Error(mailResult.error.message)
      connected = Boolean(connectionResult.data)
      gmailEmail = connectionResult.data?.gmail_email || ''
      mail = (mailResult.data || []) as MailRow[]
    } else if (activeTab === 'forms') {
      const formsResult = await supabase.from('website_leads')
        .select('id,first_name,last_name,phone,email,interests,comments,status,source,read_at,created_at,updated_at,sms_consent')
        .eq('assigned_agent_id', userId)
        .order('created_at', { ascending: false })
        .limit(100)
      if (formsResult.error) throw new Error(formsResult.error.message)
      forms = (formsResult.data || []) as WebsiteLead[]
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>Activity Center</span>
          <h1>Notifications</h1>
          <p>Mail, client text messages, and website form submissions in one streamlined workspace.</p>
        </div>
        {canUseMailAndForms ? (
          <div className={styles.summaryMeta}>
            <span>{unreadMailCount} unread mail</span>
            <span>{unreadFormsCount} new forms</span>
          </div>
        ) : null}
      </div>

      <nav className={styles.tabs} aria-label="Notification categories">
        {canUseMailAndForms ? (
          <Link prefetch={false} href="/notifications?tab=mail" className={`${styles.tab}${activeTab === 'mail' ? ` ${styles.tabActive}` : ''}`}>
            Mail{unreadMailCount > 0 ? <span className={styles.count}>{unreadMailCount}</span> : null}
          </Link>
        ) : null}
        <Link prefetch={false} href="/notifications?tab=text" className={`${styles.tab}${activeTab === 'text' ? ` ${styles.tabActive}` : ''}`}>
          Text Messages
        </Link>
        {canUseMailAndForms ? (
          <Link prefetch={false} href="/notifications?tab=forms" className={`${styles.tab}${activeTab === 'forms' ? ` ${styles.tabActive}` : ''}`}>
            Forms{unreadFormsCount > 0 ? <span className={styles.count}>{unreadFormsCount}</span> : null}
          </Link>
        ) : null}
      </nav>

      {activeTab === 'mail' && canUseMailAndForms ? (
        <>
          <section className={styles.statusBar}>
            <div className={styles.mailIdentity}>
              <span className={`${styles.statusDot}${connected ? '' : ` ${styles.statusDotOff}`}`} aria-hidden="true" />
              <div>
                <strong>{gmailEmail || 'Gmail not connected'}</strong>
                <span>{connected ? `Messages labeled ${CRM_GMAIL_LABEL} sync into this CRM mailbox.` : 'Connect Gmail to sync labeled messages into the CRM.'}</span>
              </div>
            </div>
            <div className={styles.statusActions}>
              <div className={styles.metric}><strong>{unreadMailCount}</strong><span>unread</span></div>
              {connected ? <MailCenterRefresh connected /> : null}
              {!connected && configured ? <a className="btn btn-primary" href="/api/gmail/connect">Connect Gmail</a> : null}
            </div>
          </section>

          {!configured ? <div className={styles.notice}>Gmail needs its Google OAuth environment values before the mailbox can connect.</div> : null}
          {params.connected === '1' ? <div className={styles.notice}>Gmail connected successfully.</div> : null}
          {params.gmail_error ? <div className={styles.notice}>Gmail connection did not complete. Try connecting again.</div> : null}

          <section className={styles.content}>
            <NotificationsMailList initialMail={mail} />
          </section>
        </>
      ) : activeTab === 'forms' && canUseMailAndForms ? (
        <>
          {params.deleted === '1' ? <div className={styles.notice}>Form submission deleted.</div> : null}
          <section className={styles.formsSummary}>
            <div><span>New submissions</span><strong>{unreadFormsCount}</strong></div>
            <div><span>Total shown</span><strong>{forms.length}</strong></div>
          </section>
          <section className={styles.content}>
            {forms.length ? (
              <div className={styles.formList}>
                {forms.map((lead) => {
                  const interests = interestList(lead.interests)
                  return (
                    <Link prefetch={false} className={`${styles.formRow}${lead.read_at ? '' : ` ${styles.formRowNew}`}`} href={`/website-leads/${lead.id}`} key={lead.id}>
                      <div className={styles.formMain}>
                        <div className={styles.formTitle}>
                          <strong>{lead.first_name} {lead.last_name}</strong>
                          {!lead.read_at ? <span className={styles.newBadge}>NEW</span> : null}
                          {lead.sms_consent ? <span className={styles.newBadge}>SMS OK</span> : null}
                        </div>
                        <span>{lead.phone} · {lead.email}</span>
                        {interests.length > 0 ? <span>Coverage: {interests.join(', ')}</span> : null}
                      </div>
                      <div className={styles.formMeta}><span>{formatDate(lead.created_at)}</span><b>Open ›</b></div>
                    </Link>
                  )
                })}
              </div>
            ) : <div className={styles.empty}>No website form submissions yet.</div>}
          </section>
        </>
      ) : (
        <div className={styles.textWrap}>
          <MessagesCenter viewerName={profile?.full_name || ''} initialAgent={initialAgent} />
        </div>
      )}
    </div>
  )
}
