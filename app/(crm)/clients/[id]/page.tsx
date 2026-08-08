import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { decryptValue, last4 } from '@/lib/crypto'
import { updateClient } from '../actions'
import SensitiveReveal from './SensitiveReveal'
import MedicareDocuments from './MedicareDocuments'

type Params = Promise<{ id: string }>
type SearchParams = Promise<{ created?: string; updated?: string; upload_warning?: string }>

export default async function ClientProfilePage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { id } = await params
  const query = await searchParams
  const supabase = await createClient()

  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) redirect('/login')
  const userId = String(claimsData.claims.sub)

  const { data: profile } = await supabase
    .from('profiles')
    .select('agency_id, role')
    .eq('id', userId)
    .single()

  const { data: client } = await supabase.from('clients').select('*').eq('id', id).maybeSingle()
  if (!client) notFound()
  const { data: medicare } = await supabase.from('medicare_info').select('*').eq('client_id', id).maybeSingle()
  const { data: documents } = await supabase
    .from('documents')
    .select('id, file_name, mime_type, document_type, created_at')
    .eq('client_id', id)
    .order('created_at', { ascending: false })

  const agentEmail = String(claimsData.claims.email || '')
  const { data: currentAgent } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .single()

  const canAssignAgents = profile?.role === 'admin' || profile?.role === 'manager'
  const { data: agents } = canAssignAgents
    ? await supabase.from('profiles').select('id, full_name, role, active').eq('agency_id', profile!.agency_id).eq('active', true).in('role', ['admin', 'agent']).order('full_name')
    : { data: null }

  let ssnMasked = 'Not saved'
  let dlMasked = 'Not saved'
  let mbiMasked = 'Not saved'
  let medicaidMasked = 'Not saved'
  try {
    ssnMasked = client.ssn_ciphertext ? last4(decryptValue(client.ssn_ciphertext)) : 'Not saved'
    dlMasked = client.drivers_license_ciphertext ? last4(decryptValue(client.drivers_license_ciphertext)) : 'Not saved'
    mbiMasked = medicare?.medicare_number_ciphertext ? last4(decryptValue(medicare.medicare_number_ciphertext)) : 'Not saved'
    medicaidMasked = medicare?.medicaid_number_ciphertext ? last4(decryptValue(medicare.medicaid_number_ciphertext)) : 'Not saved'
  } catch {
    // Keep sensitive fields masked if the encryption key is unavailable or invalid.
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'end', flexWrap: 'wrap' }}>
        <div>
          <h1>{client.first_name} {client.last_name}</h1>
          <p className="subtle">Edit any client information below, then save your changes.</p>
        </div>
        <Link href="/clients" className="btn btn-secondary">Back to search</Link>
      </div>

      {query.created === '1' ? <div className="notice notice-success" style={{ marginTop: 18 }}>Client saved successfully.</div> : null}
      {query.updated === '1' ? <div className="notice notice-success" style={{ marginTop: 18 }}>Client changes saved successfully.</div> : null}
      {query.upload_warning === '1' ? <div className="notice" style={{ marginTop: 18 }}>Client saved, but one or more staged files did not upload. You can upload them again under Medicare Information.</div> : null}

      <form action={updateClient} className="grid" style={{ marginTop: 20 }}>
        <input type="hidden" name="client_id" value={client.id} />

        <details className="section-details" open>
          <summary>Client Information</summary>
          <div className="section-body">
            <div className="form-grid" style={{ marginTop: 16 }}>
              <label className="label">First name<input className="input" name="first_name" required defaultValue={client.first_name || ''} /></label>
              <label className="label">Last name<input className="input" name="last_name" required defaultValue={client.last_name || ''} /></label>
              <label className="label">Date of birth<input className="input" type="date" name="date_of_birth" defaultValue={client.date_of_birth || ''} /></label>
              <label className="label">Gender<select className="select" name="gender" defaultValue={client.gender || ''}><option value="">Select</option><option>Male</option><option>Female</option><option>Other</option></select></label>
              <label className="label">Email<input className="input" type="email" name="email" inputMode="email" defaultValue={client.email || ''} /></label>
              <label className="label">Phone<input className="input" type="tel" name="phone" inputMode="tel" defaultValue={client.phone || ''} /></label>
              <label className="label span-2">Street address<input className="input" name="address_line1" autoComplete="street-address" defaultValue={client.address_line1 || ''} /></label>
              <label className="label">City<input className="input" name="city" defaultValue={client.city || ''} /></label>
              <label className="label">State<input className="input" name="state" maxLength={2} placeholder="MS" defaultValue={client.state || ''} /></label>
              <label className="label">ZIP code<input className="input" name="zip_code" inputMode="numeric" defaultValue={client.zip_code || ''} /></label>
              <label className="label">County<input className="input" name="county" defaultValue={client.county || ''} /></label>

              {canAssignAgents ? (
                <label className="label span-2">Assigned agent
                  <select className="select" name="assigned_agent_id" defaultValue={client.assigned_agent_id || userId}>
                    {(agents || []).map((agent: { id: string; full_name: string; role: string }) => <option key={agent.id} value={agent.id}>{agent.full_name} ({agent.role})</option>)}
                  </select>
                </label>
              ) : null}

              <div className="label">Social Security number
                <SensitiveReveal clientId={client.id} field="ssn" masked={ssnMasked} />
                <input className="input" name="ssn" type="password" autoComplete="new-password" inputMode="numeric" placeholder="Enter a new SSN only to replace the saved value" />
                <span className="field-help">The box above is only for replacing the saved SSN.</span>
                <span className="clear-sensitive"><input type="checkbox" name="clear_ssn" /> Clear saved SSN</span>
              </div>
              <div className="label">Driver license number
                <SensitiveReveal clientId={client.id} field="drivers_license" masked={dlMasked} />
                <input className="input" name="drivers_license" type="password" autoComplete="new-password" placeholder="Enter a new license number only to replace the saved value" />
                <span className="field-help">The box above is only for replacing the saved license number.</span>
                <span className="clear-sensitive"><input type="checkbox" name="clear_drivers_license" /> Clear saved license number</span>
              </div>
              <label className="label">License state<input className="input" name="drivers_license_state" maxLength={2} defaultValue={client.drivers_license_state || ''} /></label>
              <label className="label">License expiration<input className="input" type="date" name="drivers_license_expiration" defaultValue={client.drivers_license_expiration || ''} /></label>
            </div>
          </div>
        </details>

        <details className="section-details" open>
          <summary>Products</summary>
          <div className="section-body">
            <div className="checkbox-row" style={{ marginTop: 16 }}>
              <label className="checkbox-card"><input type="checkbox" name="is_medicare" defaultChecked={client.is_medicare} /> Medicare</label>
              <label className="checkbox-card"><input type="checkbox" name="is_life" defaultChecked={client.is_life} /> Life</label>
              <label className="checkbox-card"><input type="checkbox" name="is_retirement" defaultChecked={client.is_retirement} /> Retirement</label>
            </div>
          </div>
        </details>

        <details className="section-details" open={Boolean(client.is_medicare || medicare)}>
          <summary>Medicare Information</summary>
          <div className="section-body">
            <div className="form-grid" style={{ marginTop: 16 }}>
              <div className="label">Medicare number
                <SensitiveReveal clientId={client.id} field="medicare_number" masked={mbiMasked} />
                <input className="input" name="medicare_number" type="password" autoComplete="new-password" placeholder="Enter a new Medicare number only to replace the saved value" />
                <span className="field-help">The box above is only for replacing the saved Medicare number.</span>
                <span className="clear-sensitive"><input type="checkbox" name="clear_medicare_number" /> Clear saved Medicare number</span>
              </div>
              <div className="label">Medicaid number
                <SensitiveReveal clientId={client.id} field="medicaid_number" masked={medicaidMasked} />
                <input className="input" name="medicaid_number" type="password" autoComplete="new-password" placeholder="Enter a new Medicaid number only to replace the saved value" />
                <span className="field-help">The box above is only for replacing the saved Medicaid number.</span>
                <span className="clear-sensitive"><input type="checkbox" name="clear_medicaid_number" /> Clear saved Medicaid number</span>
              </div>
              <label className="label">Part A date<input className="input" type="date" name="part_a_date" defaultValue={medicare?.part_a_date || ''} /></label>
              <label className="label">Part B date<input className="input" type="date" name="part_b_date" defaultValue={medicare?.part_b_date || ''} /></label>
              <label className="label">Medicaid level<select className="select" name="medicaid_level" defaultValue={medicare?.medicaid_level || ''}><option value="">Select</option><option>QMB</option><option>SLMB</option><option>QI</option><option>FBDE</option><option>Other</option></select></label>
            </div>

            <MedicareDocuments
              clientId={client.id}
              clientName={`${client.first_name} ${client.last_name}`}
              clientPhone={client.phone || ''}
              clientAddress={[client.address_line1, client.city, client.state, client.zip_code].filter(Boolean).join(', ')}
              agentName={currentAgent?.full_name || 'Mayer Insurance Group Agent'}
              agentEmail={agentEmail}
              initialDocuments={documents || []}
            />
          </div>
        </details>

        <details className="section-details" open>
          <summary>Notes</summary>
          <div className="section-body"><label className="label" style={{ marginTop: 16 }}>Client notes<textarea className="textarea" name="notes" defaultValue={client.notes || ''} /></label></div>
        </details>

        <div className="sticky-save-bar">
          <span className="subtle">Changes are saved to the shared CRM database.</span>
          <button className="btn btn-primary" type="submit">Save Changes</button>
        </div>
      </form>
    </>
  )
}
