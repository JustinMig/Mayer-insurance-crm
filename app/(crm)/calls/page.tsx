import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function CallsPage() {
  redirect('/notifications?tab=calls')
}
