import { redirect } from 'next/navigation'
import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import NewClientForm from './NewClientForm'

type AgentOption = { id: string; full_name: string; role: string }

export default async function NewClientPage() {
  const supabase = await createSupabaseClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) redirect('/login')

  const userId = String(claimsData.claims.sub)
  const { data: profile } = await supabase
    .from('profiles')
    .select('agency_id, role, full_name')
    .eq('id', userId)
    .single()

  if (!profile?.agency_id) throw new Error('Your CRM profile is not connected to an agency.')

  const canAssignAgent = profile.role === 'admin' || profile.role === 'manager'
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
    <>
      <h1>Add Client</h1>
      <p className="subtle">Enter the client once. The record is immediately available on your phone, tablet, and computer.</p>
      <NewClientForm
        currentUserId={userId}
        currentUserName={profile.full_name || 'Mayer Insurance Group Agent'}
        currentUserEmail={String(claimsData.claims.email || '')}
        currentUserRole={profile.role}
        agents={agents}
      />
    </>
  )
}
