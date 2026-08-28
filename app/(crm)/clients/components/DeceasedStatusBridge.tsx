'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import { useClientRecordBootstrap } from '../../components/ClientRecordBootstrapContext'

function clientIdFromPath(pathname: string) {
  const match = pathname.match(/^\/clients\/([^/]+)$/)
  if (!match || match[1] === 'new') return ''
  return decodeURIComponent(match[1])
}

export default function DeceasedStatusBridge() {
  const pathname = usePathname()
  const clientId = useMemo(() => clientIdFromPath(pathname), [pathname])
  const bootstrap = useClientRecordBootstrap()
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null)
  const [deceased, setDeceased] = useState(false)

  useEffect(() => {
    let disposed = false
    let observer: MutationObserver | null = null

    const attach = () => {
      if (disposed) return false
      const form = document.querySelector('.add-client-form, .client-profile-form') as HTMLFormElement | null
      const row = form?.querySelector('.product-choice-row') as HTMLElement | null
      if (!form || !row) return false

      let host = row.querySelector('#deceased-status-mount') as HTMLElement | null
      if (!host) {
        host = document.createElement('span')
        host.id = 'deceased-status-mount'
        host.style.display = 'contents'
        row.appendChild(host)
      }
      setMountNode(host)
      return true
    }

    if (!attach()) {
      const root = document.querySelector<HTMLElement>('.content')
      if (root) {
        observer = new MutationObserver(() => {
          if (attach()) {
            observer?.disconnect()
            observer = null
          }
        })
        observer.observe(root, { childList: true, subtree: true })
      }
    }

    return () => {
      disposed = true
      observer?.disconnect()
      document.getElementById('deceased-status-mount')?.remove()
      setMountNode(null)
    }
  }, [pathname])

  useEffect(() => {
    if (!clientId) {
      setDeceased(false)
      return
    }

    if (bootstrap?.data) {
      setDeceased(Boolean(bootstrap.data.is_deceased))
      return
    }

    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/status`, {
          cache: 'no-store',
          signal: controller.signal
        })
        const data = await response.json().catch(() => ({}))
        if (!controller.signal.aborted && response.ok) setDeceased(Boolean(data.is_deceased))
      } catch {
        // Preserve the unchecked fallback if status cannot be loaded.
      }
    })()

    return () => controller.abort()
  }, [clientId, bootstrap?.data])

  useEffect(() => {
    const form = document.querySelector('.add-client-form, .client-profile-form') as HTMLFormElement | null
    if (!form) return

    const productNames = ['is_medicare', 'is_life', 'is_retirement']
    const productInputs = productNames
      .map(name => form.elements.namedItem(name) as HTMLInputElement | null)
      .filter((input): input is HTMLInputElement => Boolean(input))

    if (deceased) {
      for (const input of productInputs) input.checked = false
    }

    const onProductChange = (event: Event) => {
      const input = event.currentTarget as HTMLInputElement
      if (input.checked) setDeceased(false)
    }

    for (const input of productInputs) input.addEventListener('change', onProductChange)
    return () => {
      for (const input of productInputs) input.removeEventListener('change', onProductChange)
    }
  }, [deceased, mountNode])

  if (!mountNode) return null

  return createPortal(
    <label className="checkbox-card deceased-choice-card">
      <input
        type="checkbox"
        name="is_deceased"
        checked={deceased}
        onChange={(event) => setDeceased(event.target.checked)}
      />
      Deceased
      <style jsx global>{`
        .deceased-choice-card{background:#eee7e4!important;border-color:#cbbab3!important;color:#654f49!important}
        .deceased-choice-card:has(input:checked){background:#dfd1cc!important;border-color:#a98f86!important;box-shadow:inset 0 0 0 1px #a98f86}
      `}</style>
    </label>,
    mountNode
  )
}
