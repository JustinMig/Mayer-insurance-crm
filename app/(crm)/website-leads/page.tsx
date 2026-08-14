import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCrmSession } from '@/lib/crm-session'
import { interestList, isJustinWebsiteLeadUser, type WebsiteLead } from '@/lib/website-leads'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  }).format(new Date(value))
}

export default async function WebsiteLeadsPage() {
  const { supabase, userId, profile } = await getCrmSession()
  if (!profile?.agency_id) redirect('/account-setup')
  if (!isJustinWebsiteLeadUser(userId)) notFound()

  const { data, error } = await supabase
    .from('website_leads')
    .select('id,first_name,last_name,phone,email,interests,comments,status,source,read_at,created_at,updated_at')
    .eq('assigned_agent_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Unable to load website submissions: ${error.message}`)
  const leads = (data || []) as WebsiteLead[]
  const unread = leads.filter((lead) => !lead.read_at).length

  return (
    <>
      <div className="clients-page-heading">
        <h1>FORM SUBMISSIONS</h1>
        <p className="subtle">New requests from the Mayer Insurance Group website. These submissions are visible only to Justin.</p>
      </div>

      <section className="card card-pad website-leads-summary" style={{ marginTop: 20 }}>
        <div><span className="subtle">New submissions</span><strong>{unread}</strong></div>
        <div><span className="subtle">Total submissions</span><strong>{leads.length}</strong></div>
      </section>

      <section className="card" style={{ marginTop: 20 }}>
        {leads.length ? (
          <div className="website-leads-list">
            {leads.map((lead) => {
              const interests = interestList(lead.interests)
              return (
                <Link prefetch={false} className={`website-lead-row${lead.read_at ? '' : ' is-new'}`} href={`/website-leads/${lead.id}`} key={lead.id}>
                  <div className="website-lead-main">
                    <div className="website-lead-title">
                      <strong>{lead.first_name} {lead.last_name}</strong>
                      {!lead.read_at && <span className="website-lead-new-badge">NEW</span>}
                    </div>
                    <span>{lead.phone} · {lead.email}</span>
                    {interests.length > 0 && <span>Coverage: {interests.join(', ')}</span>}
                  </div>
                  <div className="website-lead-meta">
                    <span>{formatDate(lead.created_at)}</span>
                    <b>Open ›</b>
                  </div>
                </Link>
              )
            })}
          </div>
        ) : (
          <div className="empty">No website form submissions yet.</div>
        )}
      </section>
    </>
  )
}
