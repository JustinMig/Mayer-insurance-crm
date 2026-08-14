import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCrmSession } from '@/lib/crm-session'
import { interestList, isJustinWebsiteLeadUser, type WebsiteLead } from '@/lib/website-leads'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  }).format(new Date(value))
}

export default async function WebsiteLeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId, profile } = await getCrmSession()
  if (!profile?.agency_id) redirect('/account-setup')
  if (!isJustinWebsiteLeadUser(userId)) notFound()

  const { id } = await params
  const { data, error } = await supabase
    .from('website_leads')
    .select('id,first_name,last_name,phone,email,interests,comments,status,source,read_at,created_at,updated_at')
    .eq('id', id)
    .eq('assigned_agent_id', userId)
    .maybeSingle()

  if (error) throw new Error(`Unable to load website submission: ${error.message}`)
  if (!data) notFound()

  const lead = data as WebsiteLead
  if (!lead.read_at) {
    const { error: readError } = await supabase
      .from('website_leads')
      .update({ read_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', lead.id)
      .eq('assigned_agent_id', userId)
    if (readError) throw new Error(`Unable to mark website submission as read: ${readError.message}`)
  }

  const interests = interestList(lead.interests)

  return (
    <>
      <div className="website-lead-detail-heading">
        <div>
          <Link prefetch={false} className="website-lead-back" href="/website-leads">← FORM SUBMISSIONS</Link>
          <h1>{lead.first_name} {lead.last_name}</h1>
          <p className="subtle">Submitted {formatDate(lead.created_at)}</p>
        </div>
        <span className="badge">{lead.status.toUpperCase().replaceAll('_', ' ')}</span>
      </div>

      <section className="card card-pad website-lead-detail-card" style={{ marginTop: 20 }}>
        <dl className="definition">
          <dt>Name</dt><dd>{lead.first_name} {lead.last_name}</dd>
          <dt>Phone</dt><dd><a href={`tel:${lead.phone}`}>{lead.phone}</a></dd>
          <dt>Email</dt><dd><a href={`mailto:${lead.email}`}>{lead.email}</a></dd>
          <dt>Coverage Interest</dt><dd>{interests.length ? interests.join(', ') : 'Not provided'}</dd>
          <dt>Source</dt><dd>{lead.source === 'squarespace' ? 'MayerIG.com Squarespace form' : lead.source}</dd>
        </dl>

        <div className="website-lead-message">
          <span>Message</span>
          <p>{lead.comments || 'No message was included.'}</p>
        </div>
      </section>

      <div className="toolbar">
        <a className="btn btn-primary" href={`tel:${lead.phone}`}>Call</a>
        <a className="btn btn-secondary" href={`mailto:${lead.email}`}>Email</a>
        <Link prefetch={false} className="btn btn-secondary" href="/website-leads">Back to submissions</Link>
      </div>
    </>
  )
}
