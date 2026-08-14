import Link from 'next/link'
import { getCrmSession } from '@/lib/crm-session'

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await getCrmSession()

  const isAgentPortal = profile?.role === 'agent'
  const isIsaiahPortal = isAgentPortal && profile?.full_name?.trim().toLowerCase() === 'isaiah hernandez'
  const portalBrand = isIsaiahPortal ? 'Platinum Financial' : isAgentPortal ? (profile?.full_name || 'Agent Portal') : 'Mayer Insurance Group'
  const brandLogo = isIsaiahPortal ? '/platinum-car.svg' : '/mayer-bear.png'
  const brandLogoAlt = isIsaiahPortal ? 'Platinum Financial car' : 'Mayer Insurance Group bear'

  return (
    <div className="crm-shell">
      <aside className="sidebar">
        <div className="brand">
          <Link prefetch={false} className="brand-bear-link" href="/dashboard" aria-label="Go to Dashboard">
            <img className={`brand-bear${isIsaiahPortal ? ' brand-car' : ''}`} src={brandLogo} alt={brandLogoAlt} />
          </Link>
          <div className="brand-text">
            <strong>{portalBrand}</strong>
            <span>{isIsaiahPortal ? 'Agent Portal' : isAgentPortal ? 'Agent Portal' : 'CRM'}</span>
          </div>
        </div>
        <nav className="nav">
          <Link prefetch={false} className="nav-link nav-dashboard" href="/dashboard">Dashboard</Link>
          <Link prefetch={false} className="nav-link nav-add-client" href="/clients/new">NEW CLIENT</Link>
          <Link prefetch={false} className="nav-link nav-clients" href="/clients">CLIENT RECORDS</Link>
          <form action="/auth/signout" method="post"><button className="nav-signout" type="submit">Sign out</button></form>
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-brand">
            <Link prefetch={false} className="topbar-bear-link" href="/dashboard" aria-label="Go to Dashboard">
              <img className={`topbar-bear${isIsaiahPortal ? ' topbar-car' : ''}`} src={brandLogo} alt={brandLogoAlt} />
            </Link>
            <strong>{portalBrand}</strong>
          </div>
          <span className="topbar-user">{isAgentPortal ? 'Agent Portal' : `${profile?.full_name || 'CRM User'}${profile?.role ? ` · ${profile.role}` : ''}`}</span>
        </header>
        <main className="content">{children}</main>
      </div>

      <nav className="mobile-nav">
        <Link prefetch={false} href="/dashboard"><b>⌂</b><span>Home</span></Link>
        <Link prefetch={false} href="/clients/new"><b>＋</b><span>NEW</span></Link>
        <Link prefetch={false} href="/clients"><b>⌕</b><span>RECORDS</span></Link>
        <form action="/auth/signout" method="post" style={{ display: 'contents' }}><button type="submit" className="mobile-signout"><b>⇥</b>Sign out</button></form>
      </nav>
    </div>
  )
}
