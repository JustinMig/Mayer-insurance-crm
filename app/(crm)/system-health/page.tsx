import { redirect } from 'next/navigation'
import { getCrmSession } from '@/lib/crm-session'
import SystemHealthClient from './SystemHealthClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function SystemHealthPage() {
  const { profile } = await getCrmSession()
  if (!profile?.agency_id) redirect('/account-setup')
  if (profile.role !== 'admin') redirect('/dashboard')
  return <SystemHealthClient />
}
