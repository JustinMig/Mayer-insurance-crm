import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCrmSession } from '@/lib/crm-session'
import { interestList, isJustinWebsiteLeadUser, type WebsiteLead } from '@/lib/website-leads'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const PAGE_SIZE = 50

type SearchParams = Promise<{
  page?: string
  deleted?: string
}>

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  }).format(new Date(value))
}

function pageHref(page: number) {
  return page <= 1 ? '/website-leads' : `/website-leads?page=${page}`
}

export default async function WebsiteLeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const requestedPage = Number.parseInt(params.page || '1', 10)
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const { supabase, userId, profile } = await getCrmSession()
  if (!profile?.agency_id) redirect('/account-setup')
  if (!isJustinWebsiteLeadUser(userId)) notFound()

  const [leadsResult, unreadResult] = await Promise.all([
    supabase
      .from('website_leads')
      .select('id,first_name,last_name,phone,email,interests,comments,status,source,read_at,created_at,updated_at,sms_consent', { count: 'exact' })
      .eq('assigned_agent_id', userId)
      .order('created_at', { ascending: false })
      .range(from, to),
    supabase
      .from('website_leads')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_agent_id', userId)
      .is('read_at', null),
  ])

  if (leadsResult.error) throw new Error(`Unable to load website submissions: ${leadsResult.error.message}`)
  if (unreadResult.error) throw new Error(`Unable to load website submission count: ${unreadResult.error.message}`)

  const leads = (leadsResult.data || []) as WebsiteLead[]
  const total = leadsResult.count || 0
  const unread = unreadResult.count || 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)

  if (page > totalPages && total > 0) redirect(pageHref(totalPages))

  const firstItem = total === 0 ? 0 : from + 1
  const lastItem = Math.min(from + leads.length, total)

  return (
    <>
      <div className="clients-page-heading">
        <h1>FORM SUBMISSIONS</h1>
        <p className="subtle">New requests from the Mayer Insurance Group website. These submissions are visible only to Justin.</p>
      </div>

      {params.deleted === '1' && (
        <div className="notice" style={{ marginTop: 16 }}>
          Form submission deleted.
        </div>
      )}

      <section className="card card-pad website-leads-summary" style={{ marginTop: 20 }}>
        <div><span className="subtle">New submissions</span><strong>{unread}</strong></div>
        <div><span className="subtle">Total submissions</span><strong>{total}</strong></div>
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
                      {lead.sms_consent && <span className="website-lead-new-badge" style={{ background: '#e7f7ed', color: '#176b38' }}>SMS OK</span>}
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

      {total > PAGE_SIZE && (
        <div
          className="card card-pad"
          style={{
            marginTop: 14,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <span className="subtle">
            Showing {firstItem}–{lastItem} of {total} submissions · Page {currentPage} of {totalPages}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            {currentPage > 1 ? (
              <Link className="btn btn-secondary" href={pageHref(currentPage - 1)} prefetch={false}>Previous</Link>
            ) : (
              <span className="btn btn-secondary" style={{ opacity: .45, pointerEvents: 'none' }}>Previous</span>
            )}
            {currentPage < totalPages ? (
              <Link className="btn btn-secondary" href={pageHref(currentPage + 1)} prefetch={false}>Next</Link>
            ) : (
              <span className="btn btn-secondary" style={{ opacity: .45, pointerEvents: 'none' }}>Next</span>
            )}
          </div>
        </div>
      )}
    </>
  )
}
