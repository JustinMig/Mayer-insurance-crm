import { redirect } from 'next/navigation'
import { getCrmSession } from '@/lib/crm-session'
import { canAssignClients } from '@/lib/client-access'
import NewClientForm from './NewClientForm'
import styles from './NewClientForm.module.css'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type AgentOption = { id: string; full_name: string; role: string }

export default async function NewClientPage() {
  const { supabase, claims, userId, profile } = await getCrmSession()
  if (!profile?.agency_id) redirect('/account-setup')

  const canAssignAgent = canAssignClients(profile.role)
  let agents: AgentOption[] = []

  if (canAssignAgent) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('agency_id', profile.agency_id)
      .eq('active', true)
      .in('role', ['admin', 'agent'])
      .order('full_name')
    agents = (data || []) as AgentOption[]
  } else {
    agents = [{ id: userId, full_name: profile.full_name || 'Agent', role: profile.role }]
  }

  return (
    <div className={styles.page}>
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>Client Intake</span>
          <h1>New Client</h1>
          <p>Create the client record, add coverage information, and attach documents in one place.</p>
        </div>
        <span className={styles.requiredNote}>First name and last name are required</span>
      </div>

      <NewClientForm
        key={`${userId}:${Date.now()}`}
        currentUserId={userId}
        currentUserName={profile.full_name || String(claims.email || 'Agent')}
        currentUserEmail={String(claims.email || '')}
        currentUserRole={canAssignAgent ? 'manager' : 'agent'}
        agents={agents}
      />
    </div>
  )
}
