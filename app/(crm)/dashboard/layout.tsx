import Link from 'next/link'
import { getCrmSession } from '@/lib/crm-session'
import { isJustinWebsiteLeadUser } from '@/lib/website-leads'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { supabase, userId } = await getCrmSession()
  const isJustinPortal = isJustinWebsiteLeadUser(userId)
  let unreadWebsiteLeadCount = 0

  if (isJustinPortal) {
    const { count } = await supabase
      .from('website_leads')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_agent_id', userId)
      .is('read_at', null)
    unreadWebsiteLeadCount = count || 0
  }

  return (
    <>
      {isJustinPortal && (
        <section className="card card-pad" style={{ marginBottom: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <strong style={{ display: 'block', fontSize: 18 }}>FORMS</strong>
            <span className="subtle">
              {unreadWebsiteLeadCount > 0
                ? `${unreadWebsiteLeadCount} new ${unreadWebsiteLeadCount === 1 ? 'submission' : 'submissions'}`
                : 'Website form submissions'}
            </span>
          </div>
          <Link prefetch={false} href="/website-leads" className="btn btn-primary">
            OPEN FORMS{unreadWebsiteLeadCount > 0 ? ` (${unreadWebsiteLeadCount})` : ''}
          </Link>
        </section>
      )}
      {children}
    </>
  )
}
