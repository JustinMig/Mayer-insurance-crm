'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import RingCentralCallLink from '../../components/RingCentralCallLink'
import { toRingCentralNumber } from '@/lib/ringcentral-call-target'

type CallTarget = {
  key: string
  host: HTMLElement
  phone: string
}

export default function CampaignRingCentralCallBridge() {
  const [targets, setTargets] = useState<CallTarget[]>([])

  useEffect(() => {
    let frameId: number | null = null
    let disposed = false
    const root = document.querySelector<HTMLElement>('.campaign-detail-shell') || document.querySelector<HTMLElement>('.content') || document.body

    const scan = () => {
      frameId = null
      if (disposed) return
      const rows = Array.from(root.querySelectorAll<HTMLElement>('.campaign-client-row'))
      const next: CallTarget[] = []

      rows.forEach((row, index) => {
        const host = row.querySelector<HTMLElement>('.campaign-person-title-line')
        const phoneText = row.querySelector<HTMLElement>('.campaign-client-phone')?.textContent || ''
        const phone = toRingCentralNumber(phoneText)
        if (!host || !phone) return

        const clientLink = row.querySelector<HTMLAnchorElement>('.campaign-client-name')
        const key = `${clientLink?.getAttribute('href') || 'client'}:${phone}:${index}`
        next.push({ key, host, phone })
      })

      // Opening calling setup must not cause a campaign rendering loop.
      setTargets((current) => current.length === next.length && current.every((target, index) =>
        target.key === next[index].key && target.host === next[index].host && target.phone === next[index].phone
      ) ? current : next)
    }

    const scheduleScan = () => {
      if (disposed || frameId !== null) return
      frameId = window.requestAnimationFrame(scan)
    }

    scan()
    const observer = new MutationObserver(scheduleScan)
    observer.observe(root, { childList: true, subtree: true })
    return () => {
      disposed = true
      observer.disconnect()
      if (frameId !== null) window.cancelAnimationFrame(frameId)
    }
  }, [])

  return (
    <>
      {targets.map((target) => createPortal(
        <RingCentralCallLink phone={target.phone} className="campaign-ringcentral-call">
          ☎ Call
        </RingCentralCallLink>,
        target.host,
        target.key
      ))}
      <style jsx global>{`
        .campaign-ringcentral-call{
          appearance:none;
          border:1px solid #9ab1c2;
          border-radius:999px;
          background:#edf5fa;
          color:#315b76;
          min-height:27px;
          padding:4px 9px;
          font:inherit;
          font-size:.68rem;
          font-weight:900;
          line-height:1;
          cursor:pointer;
          white-space:nowrap;
          text-decoration:none;
          display:inline-flex;
          align-items:center;
        }
        .campaign-ringcentral-call:hover{background:#dfeef6;color:#244b64}
        @media(max-width:720px){
          .campaign-ringcentral-call{min-height:30px;padding:5px 10px;font-size:.7rem}
        }
      `}</style>
    </>
  )
}
