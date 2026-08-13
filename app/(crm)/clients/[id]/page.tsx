import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCrmSession } from '@/lib/crm-session'
import { decryptValue, last4 } from '@/lib/crypto'
import { updateClient } from '../actions'
import SensitiveReveal from './SensitiveReveal'
import MedicareDocuments from './MedicareDocuments'
import MedicationDocuments from './MedicationDocuments'
import DoctorsMedicationsFields from '../DoctorsMedicationsFields'
import LifeInsuranceFields from '../LifeInsuranceFields'
import LifeInsuranceDocuments from './LifeInsuranceDocuments'
import HealthPlanFields from '../HealthPlanFields'
import HealthPlanDocuments from './HealthPlanDocuments'
import HospitalIndemnityFields from '../HospitalIndemnityFields'
import HospitalIndemnityDocuments from './HospitalIndemnityDocuments'
import OtherCoverageDocuments from './OtherCoverageDocuments'
import DeleteClientButton from './DeleteClientButton'
import DateOfBirthInput from '../DateOfBirthInput'

type Params = Promise<{ id: string }>
type SearchParams = Promise<{ created?: string; updated?: string; upload_warning?: string }>

function yesNoValue(value: boolean | null | undefined) {
  if (value === true) return 'yes'
  if (value === false) return 'no'
  return ''
}

function heightFeet(totalInches: number | null | undefined) {
  return totalInches ? Math.floor(Number(totalInches) / 12) : ''
}

function heightInchesPart(totalInches: number | null | undefined) {
  return totalInches ? Number(totalInches) % 12 : ''
}

export default async function ClientProfilePage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { id } = await params
  const query = await searchParams
  const { supabase, claims, userId, profile } = await getCrmSession()
  if (!profile?.agency_id) redirect('/account-setup')

  const { data: client } = await supabase.from('clients').select('*').eq('id', id).maybeSingle()
  if (!client) notFound()

  const canAssignAgents = profile?.role === 'admin' || profile?.role === 'manager'
  const [
    { data: medicare },
    { data: careInfo },
    { data: specialists },
    { data: medications },
    { data: lifeInsurance },
    { data: healthPlan },
    { data: hospitalIndemnity },
    { data: banking },
    { data: documents },
    agentsResult
  ] = await Promise.all([
    supabase.from('medicare_info').select('*').eq('client_id', id).maybeSingle(),
    supabase.from('client_care_info').select('*').eq('client_id', id).maybeSingle(),
    supabase.from('client_specialists').select('*').eq('client_id', id).order('slot'),
    supabase.from('client_medications').select('*').eq('client_id', id).order('sort_order').order('created_at'),
    supabase.from('client_life_insurance').select('*').eq('client_id', id).maybeSingle(),
    supabase.from('client_health_plan_info').select('*').eq('client_id', id).maybeSingle(),
    supabase.from('client_hospital_indemnity').select('*').eq('client_id', id).maybeSingle(),
    supabase.from('client_banking_info').select('*').eq('client_id', id).maybeSingle(),
    supabase.from('documents').select('id, file_name, mime_type, document_type, created_at').eq('client_id', id).order('created_at', { ascending: false }),
    canAssignAgents && profile?.agency_id
      ? supabase.from('profiles').select('id, full_name, role, active').eq('agency_id', profile.agency_id).eq('active', true).in('role', ['admin', 'agent']).order('full_name')
      : Promise.resolve({ data: null, error: null })
  ])

  const agentEmail = String(claims.email || '')
  const agents = agentsResult.data

  let ssnMasked = 'Not saved'
  let dlMasked = 'Not saved'
  let mbiMasked = 'Not saved'
  let medicaidMasked = 'Not saved'
  let healthMemberMasked = 'Not saved'
  let routingMasked = 'Not saved'
  let accountMasked = 'Not saved'
  let debitCardMasked = 'Not saved'
  try {
    ssnMasked = client.ssn_ciphertext ? last4(decryptValue(client.ssn_ciphertext)) : 'Not saved'
    dlMasked = client.drivers_license_ciphertext ? last4(decryptValue(client.drivers_license_ciphertext)) : 'Not saved'
    mbiMasked = medicare?.medicare_number_ciphertext ? last4(decryptValue(medicare.medicare_number_ciphertext)) : 'Not saved'
    medicaidMasked = medicare?.medicaid_number_ciphertext ? last4(decryptValue(medicare.medicaid_number_ciphertext)) : 'Not saved'
    healthMemberMasked = healthPlan?.member_id_ciphertext ? last4(decryptValue(healthPlan.member_id_ciphertext)) : 'Not saved'
    routingMasked = banking?.routing_number_ciphertext ? last4(decryptValue(banking.routing_number_ciphertext)) : 'Not saved'
    accountMasked = banking?.account_number_ciphertext ? last4(decryptValue(banking.account_number_ciphertext)) : 'Not saved'
    debitCardMasked = banking?.debit_card_number_ciphertext ? last4(decryptValue(banking.debit_card_number_ciphertext)) : 'Not saved'
  } catch {
    // Keep sensitive fields masked if the encryption key is unavailable or invalid.
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'end', flexWrap: 'wrap' }}>
        <div>
          <h1>{client.first_name} {client.last_name}</h1>
          <p className="subtle">Open a section to view or edit the client information.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link prefetch={false} href="/clients" className="btn btn-secondary">Back to search</Link>
          {canAssignAgents ? <DeleteClientButton clientId={client.id} clientName={`${client.first_name} ${client.last_name}`.trim()} /> : null}
        </div>
      </div>

      {query.created === '1' ? <div className="notice notice-success" style={{ marginTop: 18 }}>Client saved successfully.</div> : null}
      {query.updated === '1' ? <div className="notice notice-success" style={{ marginTop: 18 }}>Client changes saved successfully.</div> : null}
      {query.upload_warning === '1' ? <div className="notice" style={{ marginTop: 18 }}>Client saved, but one or more staged files did not upload. You can upload them again in the matching client file section.</div> : null}

      <form action={updateClient} className="grid client-profile-form" style={{ marginTop: 20 }}>
        <input type="hidden" name="client_id" value={client.id} />

        <details className="section-details section-client">
          <summary><span>Client Information</span><small>Personal, contact, address &amp; identification</small></summary>
          <div className="section-body intake-section-body">
            {canAssignAgents ? (
              <div className="intake-group intake-group-agent">
                <div className="intake-group-heading"><div><strong>Agent Assignment</strong><span>Choose which agent owns this client record.</span></div></div>
                <label className="label">Assigned agent
                  <select className="select" name="assigned_agent_id" defaultValue={client.assigned_agent_id || userId}>
                    {(agents || []).map((agent: { id: string; full_name: string; role: string }) => <option key={agent.id} value={agent.id}>{agent.full_name} ({agent.role})</option>)}
                  </select>
                </label>
              </div>
            ) : null}

            <div className="intake-group">
              <div className="intake-group-heading"><div><strong>Personal Details</strong><span>Basic identifying information.</span></div></div>
              <div className="form-grid">
                <label className="label">First name<input className="input" name="first_name" required defaultValue={client.first_name || ''} /></label>
                <label className="label">Last name<input className="input" name="last_name" required defaultValue={client.last_name || ''} /></label>
                <label className="label">Date of birth<DateOfBirthInput defaultValue={client.date_of_birth} /></label>
                <label className="label">Gender<select className="select" name="gender" defaultValue={client.gender || ''}><option value="">Select</option><option>Male</option><option>Female</option><option>Other</option></select></label>
                <label className="label">Height - feet<input className="input" type="number" name="height_feet" inputMode="numeric" min={1} max={8} defaultValue={heightFeet(client.height_inches)} /></label>
                <label className="label">Height - inches<input className="input" type="number" name="height_in" inputMode="numeric" min={0} max={11} defaultValue={heightInchesPart(client.height_inches)} /></label>
                <label className="label">Weight (lb)<input className="input" type="number" name="weight_lbs" inputMode="numeric" min={1} max={999} defaultValue={client.weight_lbs || ''} /></label>
              </div>
            </div>

            <div className="intake-group">
              <div className="intake-group-heading"><div><strong>Client Status</strong><span>Veteran and tobacco-use information.</span></div></div>
              <div className="form-grid">
                <label className="label">Veteran<select className="select" name="is_veteran" defaultValue={yesNoValue(client.is_veteran)}><option value="">Select</option><option value="yes">Yes</option><option value="no">No</option></select></label>
                <label className="label">Smoking / tobacco use<select className="select" name="is_smoker" defaultValue={yesNoValue(client.is_smoker)}><option value="">Select</option><option value="yes">Yes</option><option value="no">No</option></select></label>
              </div>
            </div>

            <div className="intake-group">
              <div className="intake-group-heading"><div><strong>Contact Information</strong><span>How to reach the client.</span></div></div>
              <div className="form-grid">
                <label className="label">Email<input className="input" type="email" name="email" inputMode="email" defaultValue={client.email || ''} /></label>
                <label className="label">Phone<input className="input" type="tel" name="phone" inputMode="tel" defaultValue={client.phone || ''} /></label>
              </div>
            </div>

            <div className="intake-group">
              <div className="intake-group-heading"><div><strong>Address</strong><span>Residential and county information.</span></div></div>
              <div className="form-grid">
                <label className="label span-2">Street address<input className="input" name="address_line1" autoComplete="street-address" defaultValue={client.address_line1 || ''} /></label>
                <label className="label">City<input className="input" name="city" defaultValue={client.city || ''} /></label>
                <label className="label">State<input className="input" name="state" maxLength={2} placeholder="MS" defaultValue={client.state || ''} /></label>
                <label className="label">ZIP code<input className="input" name="zip_code" inputMode="numeric" defaultValue={client.zip_code || ''} /></label>
                <label className="label">County<input className="input" name="county" defaultValue={client.county || ''} /></label>
              </div>
            </div>

            <div className="intake-group intake-group-sensitive">
              <div className="intake-group-heading"><div><strong>Identification</strong><span>Sensitive values are encrypted before storage.</span></div></div>
              <div className="form-grid">
                <div className="label">Social Security number
                  <SensitiveReveal clientId={client.id} field="ssn" masked={ssnMasked} />
                  <input className="input" name="ssn" type="text" autoComplete="off" inputMode="numeric" placeholder="Enter a new SSN only to replace the saved value" />
                  <span className="clear-sensitive"><input type="checkbox" name="clear_ssn" /> Clear saved SSN</span>
                </div>
                <div className="label">Driver&apos;s license number
                  <SensitiveReveal clientId={client.id} field="drivers_license" masked={dlMasked} />
                  <input className="input" name="drivers_license" type="text" autoComplete="off" placeholder="Enter a new license number only to replace the saved value" />
                  <span className="clear-sensitive"><input type="checkbox" name="clear_drivers_license" /> Clear saved license number</span>
                </div>
                <label className="label">License state<input className="input" name="drivers_license_state" maxLength={2} defaultValue={client.drivers_license_state || ''} /></label>
                <label className="label">License expiration<input className="input" type="date" name="drivers_license_expiration" defaultValue={client.drivers_license_expiration || ''} /></label>
              </div>
            </div>

            <div className="intake-group">
              <div className="intake-group-heading"><div><strong>Products</strong><span>Select every product category that applies.</span></div></div>
              <div className="checkbox-row product-choice-row">
                <label className="checkbox-card"><input type="checkbox" name="is_medicare" defaultChecked={client.is_medicare} /> Medicare</label>
                <label className="checkbox-card"><input type="checkbox" name="is_life" defaultChecked={client.is_life} /> Life</label>
                <label className="checkbox-card"><input type="checkbox" name="is_retirement" defaultChecked={client.is_retirement} /> Retirement</label>
              </div>
            </div>
          </div>
        </details>

        <details className="section-details section-medicare">
          <summary><span>Medicare Information</span><small>Medicare, Medicaid, dates &amp; documents</small></summary>
          <div className="section-body intake-section-body">
            <div className="intake-group">
              <div className="intake-group-heading"><div><strong>Coverage Identification</strong><span>Medicare and Medicaid information.</span></div></div>
              <div className="form-grid">
                <div className="label">Medicare number
                  <SensitiveReveal clientId={client.id} field="medicare_number" masked={mbiMasked} />
                  <input className="input" name="medicare_number" type="text" autoComplete="off" placeholder="Enter a new Medicare number only to replace the saved value" />
                  <span className="clear-sensitive"><input type="checkbox" name="clear_medicare_number" /> Clear saved Medicare number</span>
                </div>
                <div className="label">Medicaid number
                  <SensitiveReveal clientId={client.id} field="medicaid_number" masked={medicaidMasked} />
                  <input className="input" name="medicaid_number" type="text" autoComplete="off" placeholder="Enter a new Medicaid number only to replace the saved value" />
                  <span className="clear-sensitive"><input type="checkbox" name="clear_medicaid_number" /> Clear saved Medicaid number</span>
                </div>
                <label className="label">Medicaid level<select className="select" name="medicaid_level" defaultValue={medicare?.medicaid_level || ''}><option value="">Select</option><option>QMB</option><option>SLMB</option><option>QI</option><option>FBDE</option><option>Other</option></select></label>
              </div>
            </div>
            <div className="intake-group">
              <div className="intake-group-heading"><div><strong>Medicare Effective Dates</strong><span>Original Part A and Part B effective dates.</span></div></div>
              <div className="form-grid">
                <label className="label">Part A date<input className="input" type="date" name="part_a_date" defaultValue={medicare?.part_a_date || ''} /></label>
                <label className="label">Part B date<input className="input" type="date" name="part_b_date" defaultValue={medicare?.part_b_date || ''} /></label>
              </div>
            </div>
            <div className="intake-group intake-group-files">
              <MedicareDocuments
                clientId={client.id}
                clientName={`${client.first_name} ${client.last_name}`}
                clientPhone={client.phone || ''}
                clientAddress={[client.address_line1, client.city, client.state, client.zip_code].filter(Boolean).join(', ')}
                agentName={profile?.full_name || 'Mayer Insurance Group Agent'}
                agentEmail={agentEmail}
                initialDocuments={(documents || []).filter(doc => ['medicare_document', 'medicare_photo', 'scope_of_appointment', 'card_information'].includes(doc.document_type || ''))}
              />
            </div>
          </div>
        </details>

        <details className="section-details section-care">
          <summary><span>Doctors &amp; Medications</span><small>Doctors, pharmacy, prescriptions &amp; medication files</small></summary>
          <div className="section-body intake-section-body">
            <DoctorsMedicationsFields careInfo={careInfo} specialists={specialists || []} medications={medications || []} />
            <div className="intake-group intake-group-files"><MedicationDocuments clientId={client.id} initialDocuments={(documents || []).filter(doc => doc.document_type === 'medications')} /></div>
          </div>
        </details>

        <details className="section-details section-life">
          <summary><span>Life Insurance</span><small>Carrier, coverage, premium, policy type &amp; files</small></summary>
          <div className="section-body intake-section-body">
            <div className="intake-group"><div className="intake-group-heading"><div><strong>Policy Details</strong><span>Carrier and coverage information.</span></div></div><LifeInsuranceFields lifeInsurance={lifeInsurance} /></div>
            <div className="intake-group intake-group-files"><LifeInsuranceDocuments clientId={client.id} initialDocuments={(documents || []).filter(doc => doc.document_type === 'life_insurance')} /></div>
          </div>
        </details>

        <details className="section-details section-health">
          <summary><span>Health Plan Info</span><small>Company, member ID, plan ID, effective date &amp; files</small></summary>
          <div className="section-body intake-section-body">
            <div className="intake-group"><div className="intake-group-heading"><div><strong>Health Plan Details</strong><span>Current medical plan information.</span></div></div><HealthPlanFields healthPlan={healthPlan} clientId={client.id} memberMasked={healthMemberMasked} /></div>
            <div className="intake-group intake-group-files"><HealthPlanDocuments clientId={client.id} initialDocuments={(documents || []).filter(doc => doc.document_type === 'health_plan')} /></div>
          </div>
        </details>

        <details className="section-details section-hospital">
          <summary><span>Hospital Indemnity Plan</span><small>Company, premium &amp; effective date</small></summary>
          <div className="section-body intake-section-body">
            <div className="intake-group"><div className="intake-group-heading"><div><strong>Plan Details</strong><span>Hospital indemnity coverage information.</span></div></div><HospitalIndemnityFields hospitalIndemnity={hospitalIndemnity} /></div>
            <div className="intake-group intake-group-files"><HospitalIndemnityDocuments clientId={client.id} initialDocuments={(documents || []).filter(doc => doc.document_type === 'hospital_indemnity')} /></div>
          </div>
        </details>

        <details className="section-details section-banking">
          <summary><span>Banking Information</span><small>Bank, account &amp; debit card details</small></summary>
          <div className="section-body intake-section-body">
            <div className="intake-group intake-group-sensitive">
              <div className="intake-group-heading"><div><strong>Bank Account</strong><span>Financial account numbers are encrypted and hidden by default.</span></div></div>
              <div className="form-grid">
                <label className="label">Bank name<input className="input" name="bank_name" defaultValue={banking?.bank_name || ''} autoComplete="off" /></label>
                <div className="label">Routing number
                  <SensitiveReveal clientId={client.id} field="bank_routing_number" masked={routingMasked} />
                  <input className="input" name="bank_routing_number" type="text" inputMode="numeric" autoComplete="off" placeholder="Enter a new routing number only to replace the saved value" />
                  <span className="clear-sensitive"><input type="checkbox" name="clear_bank_routing_number" /> Clear saved routing number</span>
                </div>
                <div className="label">Account number
                  <SensitiveReveal clientId={client.id} field="bank_account_number" masked={accountMasked} />
                  <input className="input" name="bank_account_number" type="text" inputMode="numeric" autoComplete="off" placeholder="Enter a new account number only to replace the saved value" />
                  <span className="clear-sensitive"><input type="checkbox" name="clear_bank_account_number" /> Clear saved account number</span>
                </div>
              </div>
            </div>
            <div className="intake-group intake-group-sensitive">
              <div className="intake-group-heading"><div><strong>Debit Card</strong><span>Card number is encrypted. CVV is never stored.</span></div></div>
              <div className="form-grid">
                <div className="label">Debit card number
                  <SensitiveReveal clientId={client.id} field="bank_debit_card_number" masked={debitCardMasked} />
                  <input className="input" name="bank_debit_card_number" type="text" inputMode="numeric" autoComplete="off" placeholder="Enter a new card number only to replace the saved value" />
                  <span className="clear-sensitive"><input type="checkbox" name="clear_bank_debit_card_number" /> Clear saved debit card number</span>
                </div>
                <label className="label">Expiration date<input className="input" name="bank_debit_card_expiration" inputMode="numeric" autoComplete="off" placeholder="MM/YY" maxLength={7} defaultValue={banking?.debit_card_expiration || ''} /></label>
                <label className="label">CVV code<input className="input" value="Not stored for security" disabled readOnly /><span className="field-help">CVV codes are intentionally not saved in the CRM.</span></label>
              </div>
            </div>
          </div>
        </details>

        <OtherCoverageDocuments clientId={client.id} documents={(documents || []).filter(doc => ['aca', 'dental', 'hearing', 'vision', 'retirement'].includes(doc.document_type || ''))} />

        <details className="section-details section-notes">
          <summary><span>Notes</span><small>Additional client information</small></summary>
          <div className="section-body intake-section-body"><div className="intake-group"><div className="intake-group-heading"><div><strong>Client Notes</strong><span>Add anything important that does not fit elsewhere.</span></div></div><label className="label">Notes<textarea className="textarea" name="notes" defaultValue={client.notes || ''} /></label></div></div>
        </details>

        <div className="sticky-save-bar">
          <span className="subtle">Changes are saved to the shared CRM database.</span>
          <button className="btn btn-primary" type="submit">Save Changes</button>
        </div>
      </form>
    </>
  )
}
