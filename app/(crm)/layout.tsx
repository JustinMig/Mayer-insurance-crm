import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims) redirect('/login')

  const userId = String(data.claims.sub)
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', userId)
    .maybeSingle()

  return (
    <div className="crm-shell">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-bear" src="/mayer-bear.png" alt="Mayer Insurance Group bear" />
          <div className="brand-text">
            <strong>Mayer Insurance Group</strong>
            <span>CRM</span>
          </div>
        </div>
        <nav className="nav">
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/clients/new">Add Client</Link>
          <Link href="/clients">Clients</Link>
          <form action="/auth/signout" method="post"><button type="submit">Sign out</button></form>
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-brand">
            <img className="topbar-bear" src="/mayer-bear.png" alt="" aria-hidden="true" />
            <strong>Mayer Insurance Group</strong>
          </div>
          <span className="topbar-user">{profile?.full_name || 'CRM User'}{profile?.role ? ` · ${profile.role}` : ''}</span>
        </header>
        <main className="content">{children}</main>
      </div>

      <nav className="mobile-nav">
        <Link href="/dashboard"><b>⌂</b><span>Home</span></Link>
        <Link href="/clients/new"><b>＋</b><span>Add</span></Link>
        <Link href="/clients"><b>⌕</b><span>Clients</span></Link>
        <form action="/auth/signout" method="post" style={{ display: 'contents' }}><button type="submit" className="mobile-signout"><b>⇥</b>Sign out</button></form>
      </nav>
    </div>
  )
}
