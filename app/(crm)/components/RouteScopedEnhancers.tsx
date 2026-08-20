'use client'

import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'

const ClientDraftGuard = dynamic(() => import('./ClientDraftGuard'), { ssr: false })
const AddressAutoFill = dynamic(() => import('./AddressAutoFill'), { ssr: false })
const ClientPhoneAutoFormat = dynamic(() => import('./ClientPhoneAutoFormat'), { ssr: false })
const ClientTextingDock = dynamic(() => import('./ClientTextingDock'), { ssr: false })
const SoaTextBridge = dynamic(() => import('./SoaTextBridge'), { ssr: false })
const ManualWorkspaceDates = dynamic(() => import('./ManualWorkspaceDates'), { ssr: false })
const AppointmentFormStyler = dynamic(() => import('./AppointmentFormStyler'), { ssr: false })
const LeadInfoBridge = dynamic(() => import('../clients/components/LeadInfoBridge'), { ssr: false })
const MedicareGovCredentialsBridge = dynamic(() => import('../clients/components/MedicareGovCredentialsBridge'), { ssr: false })
const DeceasedStatusBridge = dynamic(() => import('../clients/components/DeceasedStatusBridge'), { ssr: false })

export default function RouteScopedEnhancers() {
  const pathname = usePathname()
  const isNewClient = pathname === '/clients/new'
  const isClientRecord = /^\/clients\/[^/]+$/.test(pathname) && !isNewClient
  const isClientForm = isNewClient || isClientRecord
  const usesWorkspaceDates = pathname === '/dashboard' || pathname === '/calendar' || pathname.startsWith('/workspace') || pathname.startsWith('/leads')
  const usesAppointmentStyler = pathname === '/dashboard' || pathname === '/calendar'
  const usesLeadBridge = isClientForm || pathname.startsWith('/workspace') || pathname.startsWith('/leads')

  return (
    <>
      {isClientForm ? <ClientDraftGuard key={`draft-${pathname}`} /> : null}
      {isClientForm ? <AddressAutoFill key={`address-${pathname}`} /> : null}
      {isClientForm ? <ClientPhoneAutoFormat key={`phone-${pathname}`} /> : null}
      {usesWorkspaceDates ? <ManualWorkspaceDates key={`dates-${pathname}`} /> : null}
      {usesAppointmentStyler ? <AppointmentFormStyler key={`appointment-${pathname}`} /> : null}
      {usesLeadBridge ? <LeadInfoBridge key={`lead-${pathname}`} /> : null}
      {isClientForm ? <DeceasedStatusBridge key={`deceased-${pathname}`} /> : null}
      {isClientRecord ? <MedicareGovCredentialsBridge key={`medicare-gov-${pathname}`} /> : null}
      {isClientRecord ? <ClientTextingDock key={`texting-${pathname}`} /> : null}
      {isClientRecord ? <SoaTextBridge key={`soa-text-${pathname}`} /> : null}
    </>
  )
}
