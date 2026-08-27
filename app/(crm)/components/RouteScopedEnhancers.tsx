'use client'

import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { ClientRecordBootstrapProvider } from './ClientRecordBootstrapContext'

const CLIENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const PreviousPageButton = dynamic(() => import('./PreviousPageButton'), { ssr: false })
const ClientDraftGuard = dynamic(() => import('./ClientDraftGuard'), { ssr: false })
const AddressAutoFill = dynamic(() => import('./AddressAutoFill'), { ssr: false })
const ClientPhoneAutoFormat = dynamic(() => import('./ClientPhoneAutoFormat'), { ssr: false })
const ClientTextingDock = dynamic(() => import('./ClientTextingDock'), { ssr: false })
const SoaTextBridge = dynamic(() => import('./SoaTextBridge'), { ssr: false })
const ManualWorkspaceDates = dynamic(() => import('./ManualWorkspaceDates'), { ssr: false })
const LeadInfoBridge = dynamic(() => import('../clients/components/LeadInfoBridge'), { ssr: false })
const MedicareGovCredentialsBridge = dynamic(() => import('../clients/components/MedicareGovCredentialsBridge'), { ssr: false })
const MedicareCoveragePlainBridge = dynamic(() => import('../clients/components/MedicareCoveragePlainBridge'), { ssr: false })
const DeceasedStatusBridge = dynamic(() => import('../clients/components/DeceasedStatusBridge'), { ssr: false })
const CallListNavLinks = dynamic(() => import('./CallListNavLinks'), { ssr: false })
const ClientOutreachHistoryBridge = dynamic(() => import('../clients/components/ClientOutreachHistoryBridge'), { ssr: false })

export default function RouteScopedEnhancers() {
  const pathname = usePathname()
  const isNewClient = pathname === '/clients/new'
  const clientRecordMatch = pathname.match(/^\/clients\/([^/]+)$/)
  const clientId = clientRecordMatch && CLIENT_ID_PATTERN.test(clientRecordMatch[1]) ? decodeURIComponent(clientRecordMatch[1]) : ''
  const isClientRecord = Boolean(clientId)
  const isClientForm = isNewClient || isClientRecord
  const usesWorkspaceDates = pathname === '/dashboard' || pathname === '/calendar' || pathname.startsWith('/workspace') || pathname.startsWith('/leads')
  const usesLeadBridge = isClientForm || pathname.startsWith('/workspace') || pathname.startsWith('/leads')

  const clientRecordHelpers = isClientRecord ? (
    <ClientRecordBootstrapProvider clientId={clientId}>
      <DeceasedStatusBridge key={`deceased-${pathname}`} />
      <MedicareGovCredentialsBridge key={`medicare-gov-${pathname}`} />
      <ClientOutreachHistoryBridge key={`outreach-history-${pathname}`} />
      <ClientTextingDock key={`texting-${pathname}`} />
      <SoaTextBridge key={`soa-text-${pathname}`} />
    </ClientRecordBootstrapProvider>
  ) : null

  return (
    <>
      <PreviousPageButton />
      <CallListNavLinks />
      {isClientForm ? <MedicareCoveragePlainBridge key={`medicare-plain-${pathname}`} /> : null}
      {isClientForm ? <ClientDraftGuard key={`draft-${pathname}`} /> : null}
      {isClientForm ? <AddressAutoFill key={`address-${pathname}`} /> : null}
      {isClientForm ? <ClientPhoneAutoFormat key={`phone-${pathname}`} /> : null}
      {usesWorkspaceDates ? <ManualWorkspaceDates key={`dates-${pathname}`} /> : null}
      {usesLeadBridge ? <LeadInfoBridge key={`lead-${pathname}`} /> : null}
      {isNewClient ? <DeceasedStatusBridge key={`deceased-${pathname}`} /> : null}
      {clientRecordHelpers}
    </>
  )
}
