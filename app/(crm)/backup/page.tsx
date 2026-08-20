import { redirect } from 'next/navigation'
import { getCrmSession } from '@/lib/crm-session'
import BackupDrivePanel from './BackupDrivePanel'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function BackupPage() {
  const { supabase, profile } = await getCrmSession()

  if (!profile?.agency_id) redirect('/account-setup')
  if (profile.role !== 'admin') redirect('/dashboard')

  const { data: lastBackup } = await supabase
    .from('audit_log')
    .select('created_at')
    .eq('agency_id', profile.agency_id)
    .eq('action', 'backup.google_drive.completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (
    <>
      <div className="clients-page-heading">
        <h1>CRM Backup</h1>
        <p className="subtle">Create a manual off-site copy of the CRM in Google Drive whenever you want.</p>
      </div>
      <BackupDrivePanel lastBackupAt={lastBackup?.created_at || null} />
    </>
  )
}
