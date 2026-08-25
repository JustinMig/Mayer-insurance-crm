import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCrmSession } from '@/lib/crm-session'
import { createAdminClient } from '@/lib/supabase/admin'

type ClientRow = {
  id: string
  assigned_agent_id: string | null
  first_name: string | null
  last_name: string | null
  date_of_birth: string | null
  phone: string | null
  email: string | null
  county: string | null
  state: string | null
  is_medicare: boolean | null
  is_life: boolean | null
  is_retirement: boolean | null
  created_at: string | null
}

type Match = {
  justin: ClientRow
  isaiah: ClientRow
  score: number
  label: string
  detail: string
}

function normalize(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function nameKey(client: ClientRow) {
  return `${normalize(client.first_name)}|${normalize(client.last_name)}`
}

function phoneKey(value: string | null | undefined) {
  const digits = String(value || '').replace(/\D/g, '')
  return digits.length >= 10 ? digits.slice(-10) : digits
}

function products(client: ClientRow) {
  const items: string[] = []
  if (client.is_medicare) items.push('Medicare')
  if (client.is_life) items.push('Life')
  if (client.is_retirement) items.push('Retirement')
  return items.length ? items.join(' · ') : 'No product tag'
}

function formatDate(value: string | null) {
  if (!value) return 'Not entered'
  const date = new Date(value.includes('T') ? value : `${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function comparePair(justin: ClientRow, isaiah: ClientRow): Match | null {
  const justinName = nameKey(justin)
  const isaiahName = nameKey(isaiah)
  const sameName = justinName !== '|' && justinName === isaiahName
  const justinPhone = phoneKey(justin.phone)
  const isaiahPhone = phoneKey(isaiah.phone)
  const samePhone = justinPhone.length >= 7 && justinPhone === isaiahPhone
  const sameDob = Boolean(justin.date_of_birth && isaiah.date_of_birth && justin.date_of_birth === isaiah.date_of_birth)

  if (sameName && sameDob && samePhone) {
    return { justin, isaiah, score: 3, label: 'Very strong match', detail: 'Same name, date of birth, and phone' }
  }
  if (sameName && sameDob) {
    return { justin, isaiah, score: 2, label: 'Strong match', detail: 'Same name and date of birth' }
  }
  if (sameName && samePhone) {
    return { justin, isaiah, score: 2, label: 'Strong match', detail: 'Same name and phone' }
  }
  if (sameName) {
    return { justin, isaiah, score: 1, label: 'Review match', detail: 'Same name; identifiers differ or are missing' }
  }

  const sameLast = normalize(justin.last_name) && normalize(justin.last_name) === normalize(isaiah.last_name)
  const justinFirst = normalize(justin.first_name)
  const isaiahFirst = normalize(isaiah.first_name)
  const sameFirstInitial = Boolean(justinFirst && isaiahFirst && justinFirst[0] === isaiahFirst[0])
  if (samePhone && sameLast && sameFirstInitial) {
    return { justin, isaiah, score: 1, label: 'Review match', detail: 'Same phone, last name, and first initial' }
  }

  return null
}

function ClientSide({ title, client }: { title: string; client: ClientRow }) {
  return (
    <div className="duplicate-side">
      <div className="duplicate-owner">{title}</div>
      <div className="duplicate-name">{[client.first_name, client.last_name].filter(Boolean).join(' ') || 'Unnamed client'}</div>
      <div className="duplicate-grid">
        <div><span>DOB</span><strong>{formatDate(client.date_of_birth)}</strong></div>
        <div><span>Phone</span><strong>{client.phone || 'Not entered'}</strong></div>
        <div><span>Email</span><strong>{client.email || 'Not entered'}</strong></div>
        <div><span>Location</span><strong>{[client.county, client.state].filter(Boolean).join(', ') || 'Not entered'}</strong></div>
        <div className="span-2"><span>Products</span><strong>{products(client)}</strong></div>
        <div className="span-2"><span>Record added</span><strong>{formatDate(client.created_at)}</strong></div>
      </div>
    </div>
  )
}

export default async function DuplicateClientsPage() {
  const { profile } = await getCrmSession()
  if (!profile?.agency_id) redirect('/account-setup')

  const viewerName = profile.full_name?.trim().toLowerCase() || ''
  if (profile.role !== 'admin' || viewerName !== 'justin mayer') redirect('/clients')

  const admin = createAdminClient()
  const { data: agencyProfiles, error: profileError } = await admin
    .from('profiles')
    .select('id,full_name,role,active')
    .eq('agency_id', profile.agency_id)
    .eq('active', true)

  if (profileError) throw new Error(`Unable to load agent profiles: ${profileError.message}`)

  const justinProfile = (agencyProfiles || []).find((row) => String(row.full_name || '').trim().toLowerCase() === 'justin mayer')
  const isaiahProfile = (agencyProfiles || []).find((row) => String(row.full_name || '').trim().toLowerCase() === 'isaiah hernandez')

  if (!justinProfile || !isaiahProfile) {
    return (
      <section className="card card-pad">
        <h1>Duplicate Client Cross-Compare</h1>
        <p className="subtle">Justin or Isaiah could not be found as an active CRM profile.</p>
        <Link prefetch={false} href="/clients" className="btn btn-secondary">Back to Client Records</Link>
      </section>
    )
  }

  const { data: rows, error: clientError } = await admin
    .from('clients')
    .select('id,assigned_agent_id,first_name,last_name,date_of_birth,phone,email,county,state,is_medicare,is_life,is_retirement,created_at')
    .eq('agency_id', profile.agency_id)
    .in('assigned_agent_id', [justinProfile.id, isaiahProfile.id])
    .order('last_name', { ascending: true, nullsFirst: false })
    .order('first_name', { ascending: true, nullsFirst: false })

  if (clientError) throw new Error(`Unable to compare client records: ${clientError.message}`)

  const clients = (rows || []) as ClientRow[]
  const justinClients = clients.filter((client) => client.assigned_agent_id === justinProfile.id)
  const isaiahClients = clients.filter((client) => client.assigned_agent_id === isaiahProfile.id)
  const matches: Match[] = []

  for (const justin of justinClients) {
    for (const isaiah of isaiahClients) {
      const match = comparePair(justin, isaiah)
      if (match) matches.push(match)
    }
  }

  matches.sort((a, b) => b.score - a.score || normalize(a.justin.last_name).localeCompare(normalize(b.justin.last_name)) || normalize(a.justin.first_name).localeCompare(normalize(b.justin.first_name)))

  const strongCount = matches.filter((match) => match.score >= 2).length
  const reviewCount = matches.filter((match) => match.score === 1).length

  return (
    <>
      <div className="duplicate-heading">
        <div>
          <h1>Duplicate Client Cross-Compare</h1>
          <p className="subtle">Justin Mayer vs. Isaiah Hernandez client records.</p>
        </div>
        <Link prefetch={false} href="/clients" className="btn btn-secondary">Back to Client Records</Link>
      </div>

      <div className="duplicate-stats">
        <div className="card duplicate-stat"><span>Justin clients checked</span><strong>{justinClients.length}</strong></div>
        <div className="card duplicate-stat"><span>Isaiah clients checked</span><strong>{isaiahClients.length}</strong></div>
        <div className="card duplicate-stat duplicate-stat-strong"><span>Strong duplicate matches</span><strong>{strongCount}</strong></div>
        <div className="card duplicate-stat"><span>Review matches</span><strong>{reviewCount}</strong></div>
      </div>

      <div className="notice duplicate-rule-note">
        <strong>How matching works:</strong> Strong matches require the same normalized name plus the same DOB or phone. Name-only and close phone/name matches are marked <strong>Review</strong> instead of automatically calling them duplicates.
      </div>

      {!matches.length ? (
        <section className="card"><div className="empty"><strong>No duplicate matches found.</strong><br />Justin and Isaiah currently have no records that meet the comparison rules.</div></section>
      ) : (
        <div className="duplicate-list">
          {matches.map((match) => (
            <section className="card duplicate-pair" key={`${match.justin.id}-${match.isaiah.id}`}>
              <div className="duplicate-match-head">
                <div>
                  <span className={`duplicate-badge ${match.score >= 2 ? 'strong' : 'review'}`}>{match.label}</span>
                  <strong>{match.detail}</strong>
                </div>
              </div>
              <div className="duplicate-columns">
                <ClientSide title="Justin's Record" client={match.justin} />
                <ClientSide title="Isaiah's Record" client={match.isaiah} />
              </div>
            </section>
          ))}
        </div>
      )}

      <style>{`
        .duplicate-heading{display:flex;justify-content:space-between;align-items:end;gap:14px;flex-wrap:wrap;margin-bottom:18px}
        .duplicate-heading h1{margin-bottom:4px}
        .duplicate-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:14px}
        .duplicate-stat{padding:15px;border-radius:13px}.duplicate-stat span{display:block;color:#64748b;font-size:.78rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em}.duplicate-stat strong{display:block;margin-top:5px;font-size:1.7rem;color:#172033}.duplicate-stat-strong{border-left:4px solid #4f7d63}
        .duplicate-rule-note{margin-bottom:16px;line-height:1.55}
        .duplicate-list{display:grid;gap:14px}.duplicate-pair{overflow:hidden}.duplicate-match-head{padding:12px 14px;border-bottom:1px solid #e1e7ed;background:#f8fafc}.duplicate-match-head>div{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.duplicate-match-head strong{font-size:.86rem;color:#526271}.duplicate-badge{display:inline-flex;padding:5px 9px;border-radius:999px;font-size:.72rem;font-weight:900}.duplicate-badge.strong{background:#e8f4ec;color:#2f6842;border:1px solid #bddbc7}.duplicate-badge.review{background:#fff7df;color:#765b16;border:1px solid #ead69a}
        .duplicate-columns{display:grid;grid-template-columns:1fr 1fr;gap:0}.duplicate-side{padding:16px;min-width:0}.duplicate-side+ .duplicate-side{border-left:1px solid #e1e7ed}.duplicate-owner{font-size:.75rem;font-weight:900;text-transform:uppercase;letter-spacing:.04em;color:#64748b}.duplicate-name{font-size:1.15rem;font-weight:900;color:#172033;margin:5px 0 12px}.duplicate-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.duplicate-grid>div{padding:9px 10px;border:1px solid #e3e8ee;border-radius:9px;background:#fbfcfd;min-width:0}.duplicate-grid span{display:block;font-size:.7rem;font-weight:800;color:#718096;text-transform:uppercase;letter-spacing:.03em;margin-bottom:3px}.duplicate-grid strong{display:block;font-size:.84rem;color:#2d3b49;overflow-wrap:anywhere}.duplicate-grid .span-2{grid-column:span 2}
        @media(max-width:900px){.duplicate-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:720px){.duplicate-columns{grid-template-columns:1fr}.duplicate-side+ .duplicate-side{border-left:0;border-top:1px solid #e1e7ed}.duplicate-grid{grid-template-columns:1fr}.duplicate-grid .span-2{grid-column:span 1}.duplicate-stats{grid-template-columns:1fr 1fr}.duplicate-heading .btn{width:100%}}
      `}</style>
    </>
  )
}
