import Link from 'next/link'
import type { Metadata } from 'next'
import { getCrmSession } from '@/lib/crm-session'
import { canAssignClients } from '@/lib/client-access'
import ClientDraftGuard from './components/ClientDraftGuard'
import AddressAutoFill from './components/AddressAutoFill'
import ClientPhoneAutoFormat from './components/ClientPhoneAutoFormat'
import ClientTextingDock from './components/ClientTextingDock'
import SoaTextBridge from './components/SoaTextBridge'
import NotificationsNavLink from './components/NotificationsNavLink'
import ManualWorkspaceDates from './components/ManualWorkspaceDates'
import AppointmentFormStyler from './components/AppointmentFormStyler'
import LeadInfoBridge from './clients/components/LeadInfoBridge'

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

        .nav>a[href="/dashboard"]{background:#1d4ed8!important;color:#fff!important;box-shadow:inset 4px 0 0 #93c5fd}
        .nav>a[href="/leads"]{background:#15803d!important;color:#fff!important;box-shadow:inset 4px 0 0 #86efac}
        .nav>a[href="/fex-quotes"]{background:#7e22ce!important;color:#fff!important;box-shadow:inset 4px 0 0 #d8b4fe}
        .nav>a[href="/clients/new"]{background:#ea580c!important;color:#fff!important;box-shadow:inset 4px 0 0 #fdba74}
        .nav>a[href="/clients"]{background:#0f766e!important;color:#fff!important;box-shadow:inset 4px 0 0 #99f6e4}
        .nav>a[href="/notifications"]{background:#ca8a04!important;color:#fff!important;box-shadow:inset 4px 0 0 #fde68a}
        .nav .nav-signout{background:#b91c1c!important;color:#fff!important;box-shadow:inset 4px 0 0 #fca5a5}
        .nav>a[href="/dashboard"]:hover{background:#1e40af!important;color:#fff!important}
        .nav>a[href="/leads"]:hover{background:#166534!important;color:#fff!important}
        .nav>a[href="/fex-quotes"]:hover{background:#6b21a8!important;color:#fff!important}
        .nav>a[href="/clients/new"]:hover{background:#c2410c!important;color:#fff!important}
        .nav>a[href="/clients"]:hover{background:#115e59!important;color:#fff!important}
        .nav>a[href="/notifications"]:hover{background:#a16207!important;color:#fff!important}
        .nav .nav-signout:hover{background:#991b1b!important;color:#fff!important}

        .mobile-nav>a[href="/dashboard"]{background:#dbeafe!important;color:#1e3a8a!important;border-top:4px solid #2563eb}
        .mobile-nav>a[href="/leads"]{background:#dcfce7!important;color:#14532d!important;border-top:4px solid #16a34a}
        .mobile-nav>a[href="/fex-quotes"]{background:#f3e8ff!important;color:#581c87!important;border-top:4px solid #9333ea}
        .mobile-nav>a[href="/clients/new"]{background:#ffedd5!important;color:#7c2d12!important;border-top:4px solid #ea580c}
        .mobile-nav>a[href="/clients"]{background:#ccfbf1!important;color:#134e4a!important;border-top:4px solid #0f766e}
        .mobile-nav>a[href="/notifications"]{background:#fef3c7!important;color:#78350f!important;border-top:4px solid #d97706}
        .mobile-nav .mobile-signout{background:#fee2e2!important;color:#7f1d1d!important;border-top:4px solid #dc2626}

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
      <ClientDraftGuard />
      <AddressAutoFill />
      <ClientPhoneAutoFormat />
      <ManualWorkspaceDates />
      <AppointmentFormStyler />
      <LeadInfoBridge />
      <ClientTextingDock />
      <SoaTextBridge />
      <aside className="sidebar">
        <div className="brand">
          <Link prefetch={false} className="brand-bear-link" href="/dashboard" aria-label="Go to Dashboard"><img className={`brand-bear${isIsaiahPortal ? ' brand-car' : ''}`} src={brandLogo} alt={brandLogoAlt} /></Link>
          <div className="brand-text"><strong>{portalBrand}</strong><span>{isAgentPortal ? 'Agent Portal' : 'CRM'}</span></div>
        </div>
        <nav className="nav">
          <Link prefetch={false} className="nav-link nav-dashboard" href="/dashboard">Dashboard</Link>
          <Link prefetch={false} className="nav-link nav-leads" href="/leads">LEADS</Link>
          <Link prefetch={false} className="nav-link" href="/fex-quotes">FEX QUOTES</Link>
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
          <span className="topbar-user">{isAgentPortal ? 'Agent Portal' : `${profile?.full_name || 'CRM User'}${profile?.role ? ` · ${profile.role}` : ''}`}</span>
        </header>
        <main className="content">{children}</main>
      </div>

      <nav className="mobile-nav">
        <Link prefetch={false} href="/dashboard"><b>⌂</b><span>Home</span></Link>
        <Link prefetch={false} href="/leads"><b>●</b><span>LEADS</span></Link>
        <Link prefetch={false} href="/fex-quotes"><b>$</b><span>FEX</span></Link>
        <Link prefetch={false} href="/clients/new"><b>＋</b><span>NEW</span></Link>
        <Link prefetch={false} href="/clients"><b>⌕</b><span>RECORDS</span></Link>
        <NotificationsNavLink mobile />
        <form action="/auth/signout" method="post" style={{ display: 'contents' }}><button type="submit" className="mobile-signout"><b>⇥</b>Sign out</button></form>
      </nav>
    </div>
  )
}