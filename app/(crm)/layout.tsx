import Link from 'next/link'
import type { Metadata } from 'next'
import { getCrmSession } from '@/lib/crm-session'
import { isJustinWebsiteLeadUser } from '@/lib/website-leads'
import ClientDraftGuard from './components/ClientDraftGuard'
import AddressAutoFill from './components/AddressAutoFill'
import ClientTextingDock from './components/ClientTextingDock'
import UnreadSmsDashboardCard from './components/UnreadSmsDashboardCard'

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await getCrmSession()
  const isIsaiahPortal = profile?.role === 'agent' && profile?.full_name?.trim().toLowerCase() === 'isaiah hernandez'

  if (!isIsaiahPortal) return {}

  return {
    title: 'PLATINUM - Financial Group -',
    applicationName: 'PLATINUM - Financial Group -',
    appleWebApp: { capable: true, statusBarStyle: 'default', title: 'PLATINUM' },
    manifest: '/platinum.webmanifest',
    icons: {
      icon: [
        { url: '/platinum-icon-192.png', sizes: '192x192', type: 'image/png' },
        { url: '/platinum-icon.png', sizes: '512x512', type: 'image/png' }
      ],
      apple: [{ url: '/platinum-apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
      shortcut: [{ url: '/platinum-favicon-64.png', sizes: '64x64', type: 'image/png' }]
    }
  }
}

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const { supabase, userId, profile } = await getCrmSession()

  const isAgentPortal = profile?.role === 'agent'
  const isJustinPortal = isJustinWebsiteLeadUser(userId)
  let unreadMailCount = 0

  if (isJustinPortal) {
    const { count } = await supabase
      .from('crm_mail')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null)
      .is('removed_at', null)
      .is('archived_at', null)
    unreadMailCount = count || 0
  }

  const isIsaiahPortal = isAgentPortal && profile?.full_name?.trim().toLowerCase() === 'isaiah hernandez'
  const portalBrand = isIsaiahPortal ? 'PLATINUM - Financial Group -' : isAgentPortal ? (profile?.full_name || 'Agent Portal') : 'Mayer Insurance Group'
  const brandLogo = isIsaiahPortal ? '/platinum-pf.png' : '/mayer-bear.png'
  const brandLogoAlt = isIsaiahPortal ? 'PLATINUM - Financial Group - PF logo' : 'Mayer Insurance Group bear'

  return (
    <div className="crm-shell">
      <ClientDraftGuard />
      <AddressAutoFill />
      <ClientTextingDock />
      <aside className="sidebar">
        <div className="brand">
          <Link prefetch={false} className="brand-bear-link" href="/dashboard" aria-label="Go to Dashboard"><img className={`brand-bear${isIsaiahPortal ? ' brand-car' : ''}`} src={brandLogo} alt={brandLogoAlt} /></Link>
          <div className="brand-text"><strong>{portalBrand}</strong><span>{isAgentPortal ? 'Agent Portal' : 'CRM'}</span></div>
        </div>
        <nav className="nav">
          <Link prefetch={false} className="nav-link nav-dashboard" href="/dashboard">Dashboard</Link>
          <Link prefetch={false} className="nav-link" href="/fex-quotes">FEX QUOTES</Link>
          <Link prefetch={false} className="nav-link nav-add-client" href="/clients/new">NEW CLIENT</Link>
          <Link prefetch={false} className="nav-link nav-clients" href="/clients">CLIENT RECORDS</Link>
          {isJustinPortal && (
            <Link prefetch={false} className="nav-link nav-leads" href="/mail-center"><span>MAIL CENTER</span>{unreadMailCount > 0 && <span className="nav-leads-count">{unreadMailCount}</span>}</Link>
          )}
          <form action="/auth/signout" method="post"><button className="nav-signout" type="submit">Sign out</button></form>
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-brand">
            <Link prefetch={false} className="topbar-bear-link" href="/dashboard" aria-label="Go to Dashboard"><img className={`topbar-bear${isIsaiahPortal ? ' topbar-car' : ''}`} src={brandLogo} alt={brandLogoAlt} /></Link>
            <strong>{portalBrand}</strong>
          </div>
          <span className="topbar-user">{isAgentPortal ? 'Agent Portal' : `${profile?.full_name || 'CRM User'}${profile?.role ? ` · ${profile.role}` : ''}`}</span>
        </header>
        <main className="content"><UnreadSmsDashboardCard />{children}</main>
      </div>

      <nav className="mobile-nav">
        <Link prefetch={false} href="/dashboard"><b>⌂</b><span>Home</span></Link>
        <Link prefetch={false} href="/fex-quotes"><b>$</b><span>FEX</span></Link>
        <Link prefetch={false} href="/clients/new"><b>＋</b><span>NEW</span></Link>
        <Link prefetch={false} href="/clients"><b>⌕</b><span>RECORDS</span></Link>
        {isJustinPortal && (
          <Link prefetch={false} className="mobile-leads-link" href="/mail-center"><b>✉</b><span>MAIL</span>{unreadMailCount > 0 && <i className="mobile-leads-count">{unreadMailCount}</i>}</Link>
        )}
        <form action="/auth/signout" method="post" style={{ display: 'contents' }}><button type="submit" className="mobile-signout"><b>⇥</b>Sign out</button></form>
      </nav>
    </div>
  )
}
