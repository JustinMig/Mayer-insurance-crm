'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'

export type ClientRecordBootstrapData = {
  is_deceased: boolean
  medicare_gov: {
    values: {
      username: string
      password: string
      secret_answer: string
    }
    saved: {
      username: boolean
      password: boolean
      secret_answer: boolean
      security_code_destination_name: boolean
    }
  }
}

type BootstrapState = {
  data: ClientRecordBootstrapData | null
  error: string
  loading: boolean
}

const ClientRecordBootstrapContext = createContext<BootstrapState | null>(null)

export function ClientRecordBootstrapProvider({ clientId, children }: { clientId: string; children: React.ReactNode }) {
  const [state, setState] = useState<BootstrapState>({ data: null, error: '', loading: true })

  useEffect(() => {
    const controller = new AbortController()
    setState({ data: null, error: '', loading: true })

    void (async () => {
      try {
        const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/bootstrap`, {
          cache: 'no-store',
          signal: controller.signal
        })
        const result = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(result.error || 'Unable to load client record helpers.')
        if (!controller.signal.aborted) {
          setState({ data: result as ClientRecordBootstrapData, error: '', loading: false })
        }
      } catch (error) {
        if (controller.signal.aborted) return
        setState({
          data: null,
          error: error instanceof Error ? error.message : 'Unable to load client record helpers.',
          loading: false
        })
      }
    })()

    return () => controller.abort()
  }, [clientId])

  const value = useMemo(() => state, [state])
  return <ClientRecordBootstrapContext.Provider value={value}>{children}</ClientRecordBootstrapContext.Provider>
}

export function useClientRecordBootstrap() {
  return useContext(ClientRecordBootstrapContext)
}
