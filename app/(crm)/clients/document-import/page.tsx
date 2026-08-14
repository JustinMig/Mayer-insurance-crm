import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCrmSession } from '@/lib/crm-session'
import DocumentClientImport from './DocumentClientImport'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function DocumentImportPage() {
  const { supabase, userId, profile } = await getCrmSession()
  if (!profile?.agency_id) redirect('/account-setup')

  const canAssignAgent = profile.role === 'admin' || profile.role === 'manager'
  let agents = [{ id: userId, full_name: profile.full_name || 'Current Agent' }]
  if (canAssignAgent) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('agency_id', profile.agency_id)
      .eq('active', true)
      .in('role', ['admin', 'agent'])
      .order('full_name', { ascending: true })
    if (error) throw new Error(`Unable to load agents: ${error.message}`)
    agents = (data || []).map(item => ({ id: item.id, full_name: item.full_name || 'Agent' }))
  }

  return (
    <>
      <div className="clients-page-heading document-import-page-heading">
        <div><h1>Import Client from Documents</h1><p className="subtle">Choose files from Apple Files, iCloud Drive, Finder, or Photos. The CRM scans the documents, prepares a new client, and files each document into the correct section.</p></div>
        <Link prefetch={false} href="/dashboard" className="btn btn-secondary">Back to Dashboard</Link>
      </div>
      <DocumentClientImport currentUserId={userId} currentUserName={profile.full_name || 'Current Agent'} canAssignAgent={canAssignAgent} agents={agents} />
    </>
  )
}
