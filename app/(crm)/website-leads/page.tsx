import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function WebsiteLeadsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = searchParams ? await searchParams : {}
  const deleted = Array.isArray(params.deleted) ? params.deleted[0] : params.deleted
  redirect(deleted === '1' ? '/notifications?tab=forms&deleted=1' : '/notifications?tab=forms')
}
