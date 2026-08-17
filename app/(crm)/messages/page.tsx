import MessagesCenter from './MessagesCenter'
import { getCrmSession } from '@/lib/crm-session'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function MessagesPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { profile } = await getCrmSession()
  const params = searchParams ? await searchParams : {}
  const rawAgent = Array.isArray(params.agent) ? params.agent[0] : params.agent
  const initialAgent = rawAgent === 'isaiah' ? 'isaiah' : rawAgent === 'justin' ? 'justin' : 'all'
  return <MessagesCenter viewerName={profile?.full_name || ''} initialAgent={initialAgent} />
}
