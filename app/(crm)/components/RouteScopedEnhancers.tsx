'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { ClientRecordBootstrapProvider } from './ClientRecordBootstrapContext'

const CLIENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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
const ClientOutreachHistoryBridge = dynamic(() => import('../clients/components/ClientOutreachHistoryBridge'), { ssr: false })
const OutreachAppointmentTimeBlocker = dynamic(() => import('../campaigns/OutreachAppointmentTimeBlocker'), { ssr: false })

type SectionFlags = {
  client: boolean
  medicare: boolean
}

type IdleWindow = Window & {
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
  cancelIdleCallback?: (handle: number) => void
}

const CLOSED_SECTIONS: SectionFlags = { client: false, medicare: false }

function useClientRecordActivation(enabled: boolean) {
  const [sections, setSections] = useState<SectionFlags>(CLOSED_SECTIONS)
  const [deferredReady, setDeferredReady] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setSections(CLOSED_SECTIONS)
      setDeferredReady(false)
      return
    }

    const form = document.querySelector<HTMLElement>('.client-profile-form')
    const clientSection = form?.querySelector<HTMLDetailsElement>('.section-client') || null
    const medicareSection = form?.querySelector<HTMLDetailsElement>('.section-medicare') || null

    const sync = () => {
      setSections({
        client: Boolean(clientSection?.open),
        medicare: Boolean(medicareSection?.open)
      })
    }

    clientSection?.addEventListener('toggle', sync)
    medicareSection?.addEventListener('toggle', sync)
    sync()

    const idleWindow = window as IdleWindow
    let idleId: number | null = null
    let timerId: number | null = null
    const enableDeferred = () => setDeferredReady(true)

    if (typeof idleWindow.requestIdleCallback === 'function') {
      idleId = idleWindow.requestIdleCallback(enableDeferred, { timeout: 2500 })
    } else {
      timerId = window.setTimeout(enableDeferred, 1400)
    }

    return () => {
      clientSection?.removeEventListener('toggle', sync)
      medicareSection?.removeEventListener('toggle', sync)
      if (idleId !== null && typeof idleWindow.cancelIdleCallback === 'function') idleWindow.cancelIdleCallback(idleId)
      if (timerId !== null) window.clearTimeout(timerId)
    }
  }, [enabled])

  return { sections, deferredReady }
}

export default function RouteScopedEnhancers() {
  const pathname = usePathname()
  const isNewClient = pathname === '/clients/new'
  const clientRecordMatch = pathname.match(/^\/clients\/([^/]+)$/)
  const clientId = clientRecordMatch && CLIENT_ID_PATTERN.test(clientRecordMatch[1]) ? decodeURIComponent(clientRecordMatch[1]) : ''
  const isClientRecord = Boolean(clientId)
  const isClientForm = isNewClient || isClientRecord
  const usesWorkspaceDates = pathname === '/dashboard' || pathname === '/calendar' || pathname.startsWith('/workspace') || pathname.startsWith('/leads')
  const usesLeadBridge = isClientForm || pathname.startsWith('/workspace') || pathname.startsWith('/leads')
  const usesOutreachAppointmentBlocking = pathname.startsWith('/campaigns/')
  const { sections, deferredReady } = useClientRecordActivation(isClientRecord)

  const needsClientHelpers = isNewClient || sections.client
  const needsMedicareHelpers = isNewClient || sections.medicare

  return (
    <>
      {isClientForm ? <ClientDraftGuard key={`draft-${pathname}`} /> : null}
      {isClientForm ? <DeceasedStatusBridge key={`deceased-${pathname}`} /> : null}
      {needsClientHelpers ? <AddressAutoFill key={`address-${pathname}`} /> : null}
      {needsClientHelpers ? <ClientPhoneAutoFormat key={`phone-${pathname}`} /> : null}
      {needsMedicareHelpers ? <MedicareCoveragePlainBridge key={`medicare-plain-${pathname}`} /> : null}
      {usesWorkspaceDates ? <ManualWorkspaceDates key={`dates-${pathname}`} /> : null}
      {usesLeadBridge && (!isClientRecord || sections.client) ? <LeadInfoBridge key={`lead-${pathname}`} /> : null}
      {usesOutreachAppointmentBlocking ? <OutreachAppointmentTimeBlocker key={`outreach-appointment-${pathname}`} /> : null}

      {isClientRecord && sections.medicare ? (
        <ClientRecordBootstrapProvider clientId={clientId}>
          <MedicareGovCredentialsBridge key={`medicare-gov-${pathname}`} />
        </ClientRecordBootstrapProvider>
      ) : null}

      {isClientRecord && sections.medicare ? <SoaTextBridge key={`soa-text-${pathname}`} /> : null}
      {isClientRecord && deferredReady ? <ClientOutreachHistoryBridge key={`outreach-history-${pathname}`} /> : null}
      {isClientRecord && deferredReady ? <ClientTextingDock key={`texting-${pathname}`} /> : null}
    </>
  )
}
