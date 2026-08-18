import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function MessagesPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = searchParams ? await searchParams : {}
  const rawAgent = Array.isArray(params.agent) ? params.agent[0] : params.agent
  const agent = rawAgent === 'isaiah' ? '&agent=isaiah' : rawAgent === 'justin' ? '&agent=justin' : ''
  redirect(`/notifications?tab=text${agent}`)
}
