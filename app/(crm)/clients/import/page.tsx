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
        <p className="subtle">Upload the Mayer Insurance Group CSV export. Review the recognized clients before anything is added.</p>
      </div>
      <ClientImportForm agents={agents || []} />
    </>
  )
}
