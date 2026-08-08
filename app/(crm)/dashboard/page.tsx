import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createClient()
  const currentYear = new Date().getFullYear()
  const turn65Year = currentYear - 65

  const [clients, medicare, life, turn65] = await Promise.all([
    supabase.from('clients').select('*', { count: 'exact', head: true }),
    supabase.from('clients').select('*', { count: 'exact', head: true }).eq('is_medicare', true),
    supabase.from('clients').select('*', { count: 'exact', head: true }).eq('is_life', true),
    supabase.from('clients').select('*', { count: 'exact', head: true }).gte('date_of_birth', `${turn65Year}-01-01`).lte('date_of_birth', `${turn65Year}-12-31`)
  ])

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'end', flexWrap: 'wrap' }}>
        <div><h1>Dashboard</h1><p className="subtle">Your client database at a glance.</p></div>
        <Link href="/clients/new" className="btn btn-primary">+ Add Client</Link>
      </div>

      <section className="grid grid-4" style={{ marginTop: 22 }}>
        <div className="card card-pad stat"><span>Total clients</span><strong>{clients.count || 0}</strong></div>
        <div className="card card-pad stat"><span>Medicare clients</span><strong>{medicare.count || 0}</strong></div>
        <div className="card card-pad stat"><span>Life clients</span><strong>{life.count || 0}</strong></div>
        <div className="card card-pad stat"><span>Turning 65 in {currentYear}</span><strong>{turn65.count || 0}</strong></div>
      </section>

      <section className="card card-pad" style={{ marginTop: 20 }}>
        <h2>Quick actions</h2>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <Link href="/clients/new" className="btn btn-primary">Add a client</Link>
          <Link href="/clients" className="btn btn-secondary">Search clients</Link>
          <Link href="/clients?turn65=1" className="btn btn-secondary">Turn 65 list</Link>
        </div>
      </section>
    </>
  )
}
