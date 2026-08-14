import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DeleteSubmissionButton from './DeleteSubmissionButton'

type Params = Promise<{ id: string }>

function display(value: unknown) {
  const text = String(value ?? '').trim()
  return text || 'Not provided'
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Unknown'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function interestList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean)
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item)).filter(Boolean)
      }
    } catch {
      return value ? [value] : []
    }
  }

  return []
}

export default async function WebsiteLeadDetailPage({ params }: { params: Params }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) redirect('/login')

  const { data: submission } = await supabase
    .from('website_leads')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!submission) notFound()

  // Opening a submission marks it read so the Justin-only unread badge clears.
  if (!submission.read_at) {
    await supabase
      .from('website_leads')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
  }

  const interests = interestList(submission.interests)
  const fullName = `${submission.first_name || ''} ${submission.last_name || ''}`.trim() || 'Website Lead'

  const addressParts = [
    submission.address_line1,
    [submission.city, submission.state].filter(Boolean).join(', '),
    submission.zip_code,
  ].filter((part) => String(part || '').trim())

  const fullAddress = addressParts.length ? addressParts.join(' ') : 'Not provided'

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 14,
          alignItems: 'end',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1>Form Submission</h1>
          <p className="subtle" style={{ marginBottom: 0 }}>
            Website request from <strong>{fullName}</strong> · {formatDate(submission.created_at)}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link href="/website-leads" className="btn btn-secondary">
            Back to submissions
          </Link>
          <DeleteSubmissionButton
            submissionId={submission.id}
            submissionName={fullName}
          />
        </div>
      </div>

      <div className="grid" style={{ marginTop: 20, gap: 16 }}>
        <section className="card card-pad">
          <h2 style={{ marginTop: 0 }}>Contact Information</h2>

          <div className="form-grid">
            <div className="label">
              Name
              <div className="input" style={{ height: 'auto', minHeight: 42, display: 'flex', alignItems: 'center' }}>
                {fullName}
              </div>
            </div>

            <div className="label">
              Preferred Contact Method
              <div className="input" style={{ height: 'auto', minHeight: 42, display: 'flex', alignItems: 'center' }}>
                {display(submission.preferred_contact_method)}
              </div>
            </div>

            <div className="label">
              Phone
              <div className="input" style={{ height: 'auto', minHeight: 42, display: 'flex', alignItems: 'center' }}>
                {submission.phone ? <a href={`tel:${submission.phone}`}>{submission.phone}</a> : 'Not provided'}
              </div>
            </div>

            <div className="label">
              Email
              <div className="input" style={{ height: 'auto', minHeight: 42, display: 'flex', alignItems: 'center', overflowWrap: 'anywhere' }}>
                {submission.email ? <a href={`mailto:${submission.email}`}>{submission.email}</a> : 'Not provided'}
              </div>
            </div>
          </div>
        </section>

        <section className="card card-pad">
          <h2 style={{ marginTop: 0 }}>Address</h2>

          <div
            className="notice"
            style={{
              marginTop: 0,
              fontSize: '1rem',
              lineHeight: 1.6,
              overflowWrap: 'anywhere',
            }}
          >
            <strong>{fullAddress}</strong>
          </div>

          <div className="form-grid" style={{ marginTop: 14 }}>
            <div className="label">
              Street Address
              <div className="input" style={{ height: 'auto', minHeight: 42, display: 'flex', alignItems: 'center' }}>
                {display(submission.address_line1)}
              </div>
            </div>

            <div className="label">
              City
              <div className="input" style={{ height: 'auto', minHeight: 42, display: 'flex', alignItems: 'center' }}>
                {display(submission.city)}
              </div>
            </div>

            <div className="label">
              State
              <div className="input" style={{ height: 'auto', minHeight: 42, display: 'flex', alignItems: 'center' }}>
                {display(submission.state)}
              </div>
            </div>

            <div className="label">
              ZIP Code
              <div className="input" style={{ height: 'auto', minHeight: 42, display: 'flex', alignItems: 'center' }}>
                {display(submission.zip_code)}
              </div>
            </div>
          </div>
        </section>

        <section className="card card-pad">
          <h2 style={{ marginTop: 0 }}>SMS / Text Consent</h2>

          <div className="form-grid">
            <div className="label">
              Consent Status
              <div className="input" style={{ height: 'auto', minHeight: 42, display: 'flex', alignItems: 'center', fontWeight: 800 }}>
                {submission.sms_consent ? 'OPTED IN' : 'NOT OPTED IN'}
              </div>
            </div>

            <div className="label">
              Consent Recorded
              <div className="input" style={{ height: 'auto', minHeight: 42, display: 'flex', alignItems: 'center' }}>
                {submission.sms_consent ? formatDate(submission.sms_consent_at) : 'Not applicable'}
              </div>
            </div>

            <div className="label">
              Consent Source
              <div className="input" style={{ height: 'auto', minHeight: 42, display: 'flex', alignItems: 'center' }}>
                {submission.sms_consent ? display(submission.sms_consent_source) : 'Not applicable'}
              </div>
            </div>
          </div>

          <div className="notice" style={{ marginTop: 14, lineHeight: 1.55 }}>
            {submission.sms_consent
              ? display(submission.sms_consent_text)
              : 'No affirmative SMS consent was captured with this website submission. Do not treat this submission as website SMS opt-in proof.'}
          </div>
        </section>

        <section className="card card-pad">
          <h2 style={{ marginTop: 0 }}>Coverage Interests</h2>

          {interests.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {interests.map((interest) => (
                <span
                  key={interest}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '6px 10px',
                    borderRadius: 999,
                    background: '#eef4f7',
                    border: '1px solid #d8e3e9',
                    fontSize: '.82rem',
                    fontWeight: 800,
                  }}
                >
                  {interest}
                </span>
              ))}
            </div>
          ) : (
            <p className="subtle" style={{ marginBottom: 0 }}>No coverage interests selected.</p>
          )}
        </section>

        <section className="card card-pad">
          <h2 style={{ marginTop: 0 }}>Questions / Comments</h2>
          <div
            className="notice"
            style={{
              marginTop: 0,
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
              lineHeight: 1.6,
            }}
          >
            {display(submission.comments)}
          </div>
        </section>
      </div>
    </>
  )
}
