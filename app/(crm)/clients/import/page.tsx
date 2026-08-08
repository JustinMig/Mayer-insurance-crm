import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ClientImportForm from './ClientImportForm'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function ImportClientsPage() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) redirect('/login')

  const userId = String(claimsData.claims.sub)
  const { data: profile } = await supabase
    .from('profiles')
    .select('agency_id, role')
    .eq('id', userId)
    .maybeSingle()

  if (!profile?.agency_id || !['admin', 'manager'].includes(profile.role)) redirect('/clients')

  const { data: agents } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('agency_id', profile.agency_id)
    .eq('active', true)
    .in('role', ['admin', 'agent'])
    .order('full_name', { ascending: true })

  return (
    <>
      <div>
        <h1>Import Clients</h1>
        <p className="subtle">Drop in the full Mayer Insurance Group CSV export set. The CRM will identify the main client file, match related CSVs by client ID, and preview the clients before anything is added. Existing CRM clients are filled only where their current intake fields are blank; existing values are preserved.</p>
      </div>
      <ClientImportForm agents={agents || []} />
    </>
  )
}
