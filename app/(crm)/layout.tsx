import Link from 'next/link'
import { getCrmSession } from '@/lib/crm-session'

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await getCrmSession()

  const isAgentPortal = profile?.role === 'agent'
  const portalBrand = isAgentPortal ? (profile?.full_name || 'Agent Portal') : 'Mayer Insurance Group'

  return (
    <div className="crm-shell">
      <aside className="sidebar">
        <div className="brand">
          <Link prefetch={false} className="brand-bear-link" href="/dashboard" aria-label="Go to Dashboard">
            <img className="brand-bear" src="/mayer-bear.png" alt="Mayer Insurance Group bear" />
          </Link>
          <div className="brand-text">
            <strong>{portalBrand}</strong>
            <span>{isAgentPortal ? 'Agent Portal' : 'CRM'}</span>
          </div>
        </div>
        <nav className="nav">
          <Link prefetch={false} href="/dashboard">Dashboard</Link>
          <Link prefetch={false} href="/clients/new">Add Client</Link>
          <Link prefetch={false} href="/clients">Clients</Link>
          <a href="https://mayerig.com" target="_blank" rel="noopener noreferrer">MayerIG.com ↗</a>
          <form action="/auth/signout" method="post"><button type="submit">Sign out</button></form>
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-brand">
            <Link prefetch={false} className="topbar-bear-link" href="/dashboard" aria-label="Go to Dashboard">
              <img className="topbar-bear" src="/mayer-bear.png" alt="Mayer Insurance Group bear" />
            </Link>
            <strong>{portalBrand}</strong>
          </div>
          <span className="topbar-user">{isAgentPortal ? 'Agent Portal' : `${profile?.full_name || 'CRM User'}${profile?.role ? ` · ${profile.role}` : ''}`}</span>
        </header>
        <main className="content">{children}</main>
      </div>

      <nav className="mobile-nav">
        <Link prefetch={false} href="/dashboard"><b>⌂</b><span>Home</span></Link>
        <Link prefetch={false} href="/clients/new"><b>＋</b><span>Add</span></Link>
        <Link prefetch={false} href="/clients"><b>⌕</b><span>Clients</span></Link>
        <form action="/auth/signout" method="post" style={{ display: 'contents' }}><button type="submit" className="mobile-signout"><b>⇥</b>Sign out</button></form>
      </nav>
    </div>
  )
}
