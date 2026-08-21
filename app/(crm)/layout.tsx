import Link from 'next/link'
import type { Metadata } from 'next'
import { getCrmSession } from '@/lib/crm-session'
import { canAssignClients } from '@/lib/client-access'
import NotificationsNavLink from './components/NotificationsNavLink'
import PushNotificationManager from './components/PushNotificationManager'
import RouteScopedEnhancers from './components/RouteScopedEnhancers'

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
  const { profile } = await getCrmSession()

  const isAgentPortal = profile?.role === 'agent'
  const isIsaiahPortal = isAgentPortal && profile?.full_name?.trim().toLowerCase() === 'isaiah hernandez'
  const portalBrand = isIsaiahPortal ? 'PLATINUM - Financial Group -' : isAgentPortal ? (profile?.full_name || 'Agent Portal') : 'Mayer Insurance Group'
  const brandLogo = isIsaiahPortal ? '/platinum-pf.png' : '/mayer-bear.png'
  const brandLogoAlt = isIsaiahPortal ? 'PLATINUM - Financial Group - PF logo' : 'Mayer Insurance Group bear'
  const canAssignClientRecords = canAssignClients(profile?.role)

  return (
    <div className="crm-shell">
      <style>{`
        a[href="/clients/document-import"]{display:none!important}
        .dashboard-form-alert{display:none!important}
        ${canAssignClientRecords ? '' : '.intake-group-agent{display:none!important}'}

        .nav>a[href="/dashboard"]{background:#dfe8ef!important;color:#31485b!important;box-shadow:inset 4px 0 0 #7890a3}
        .nav>a[href="/leads"]{background:#e1e9df!important;color:#3f5842!important;box-shadow:inset 4px 0 0 #849b81}
        .nav>a[href="/clients/new"]{background:#eee6da!important;color:#675542!important;box-shadow:inset 4px 0 0 #aa9277}
        .nav>a[href="/clients"]{background:#dfe9e7!important;color:#3f5b57!important;box-shadow:inset 4px 0 0 #7f9c96}
        .nav>a[href="/notifications"]{background:#eee9d8!important;color:#665f42!important;box-shadow:inset 4px 0 0 #aaa078}
        .nav .nav-signout{background:#eee1e1!important;color:#6a4949!important;box-shadow:inset 4px 0 0 #a68181}
        .nav>a[href="/dashboard"]:hover{background:#d2dee7!important;color:#263c4e!important}
        .nav>a[href="/leads"]:hover{background:#d5e1d2!important;color:#344b37!important}
        .nav>a[href="/clients/new"]:hover{background:#e3d8c9!important;color:#594837!important}
        .nav>a[href="/clients"]:hover{background:#d2e0dd!important;color:#344d49!important}
        .nav>a[href="/notifications"]:hover{background:#e2dcc7!important;color:#585238!important}
        .nav .nav-signout:hover{background:#e2d3d3!important;color:#5c3d3d!important}

        .mobile-nav>a[href="/dashboard"]{background:#edf2f5!important;color:#31485b!important;border-top:3px solid #7890a3}
        .mobile-nav>a[href="/leads"]{background:#eef3ec!important;color:#3f5842!important;border-top:3px solid #849b81}
        .mobile-nav>a[href="/clients/new"]{background:#f5f0e8!important;color:#675542!important;border-top:3px solid #aa9277}
        .mobile-nav>a[href="/clients"]{background:#edf3f2!important;color:#3f5b57!important;border-top:3px solid #7f9c96}
        .mobile-nav>a[href="/notifications"]{background:#f5f2e8!important;color:#665f42!important;border-top:3px solid #aaa078}
        .mobile-nav .mobile-signout{background:#f5eded!important;color:#6a4949!important;border-top:3px solid #a68181}

        .add-client-form>.add-client-save-row,
        .client-profile-form>.sticky-save-bar{
          order:-1000;
          position:sticky!important;
          top:10px!important;
          bottom:auto!important;
          z-index:45;
          margin:0 0 10px!important;
          padding:10px 12px!important;
          min-height:54px;
          display:flex!important;
          align-items:center!important;
          justify-content:flex-end!important;
          gap:12px!important;
          background:rgba(255,255,255,.96)!important;
          border:1px solid #dbe3ec!important;
          border-radius:12px!important;
          box-shadow:0 6px 18px rgba(15,23,42,.12)!important;
          backdrop-filter:blur(8px);
          -webkit-backdrop-filter:blur(8px);
        }
        .add-client-form>.add-client-save-row .btn,
        .client-profile-form>.sticky-save-bar .btn{
          min-width:150px;
          font-weight:800;
        }
        @media(max-width:720px){
          .add-client-form>.add-client-save-row,
          .client-profile-form>.sticky-save-bar{
            top:8px!important;
            padding:8px!important;
            min-height:50px;
          }
          .client-profile-form>.sticky-save-bar .subtle{display:none!important}
          .add-client-form>.add-client-save-row .btn,
          .client-profile-form>.sticky-save-bar .btn{width:100%;min-width:0}
        }
      `}</style>
      <RouteScopedEnhancers />
      <aside className="sidebar">
        <div className="brand">
          <Link prefetch={false} className="brand-bear-link" href="/dashboard" aria-label="Go to Dashboard"><img className={`brand-bear${isIsaiahPortal ? ' brand-car' : ''}`} src={brandLogo} alt={brandLogoAlt} /></Link>
          <div className="brand-text"><strong>{portalBrand}</strong><span>{isAgentPortal ? 'Agent Portal' : 'CRM'}</span></div>
        </div>
        <nav className="nav">
          <Link prefetch={false} className="nav-link nav-dashboard" href="/dashboard">Dashboard</Link>
          <Link prefetch={false} className="nav-link nav-leads" href="/leads">LEADS</Link>
          <Link prefetch={false} className="nav-link nav-add-client" href="/clients/new">NEW CLIENT</Link>
          <Link prefetch={false} className="nav-link nav-clients" href="/clients">CLIENT RECORDS</Link>
          <NotificationsNavLink />
          <form action="/auth/signout" method="post"><button className="nav-signout" type="submit">Sign out</button></form>
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-brand">
            <Link prefetch={false} className="topbar-bear-link" href="/dashboard" aria-label="Go to Dashboard"><img className={`topbar-bear${isIsaiahPortal ? ' topbar-car' : ''}`} src={brandLogo} alt={brandLogoAlt} /></Link>
            <strong>{portalBrand}</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 9, minWidth: 0 }}>
            <PushNotificationManager />
            <span className="topbar-user">{isAgentPortal ? 'Agent Portal' : `${profile?.full_name || 'CRM User'}${profile?.role ? ` · ${profile.role}` : ''}`}</span>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>

      <nav className="mobile-nav">
        <Link prefetch={false} href="/dashboard"><b>⌂</b><span>Home</span></Link>
        <Link prefetch={false} href="/leads"><b>●</b><span>LEADS</span></Link>
        <Link prefetch={false} href="/clients/new"><b>＋</b><span>NEW</span></Link>
        <Link prefetch={false} href="/clients"><b>⌕</b><span>RECORDS</span></Link>
        <NotificationsNavLink mobile />
        <form action="/auth/signout" method="post" style={{ display: 'contents' }}><button type="submit" className="mobile-signout"><b>⇥</b>Sign out</button></form>
      </nav>
    </div>
  )
}
