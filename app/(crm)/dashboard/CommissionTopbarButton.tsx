'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'

const CommissionQuickView = dynamic(() => import('./CommissionQuickView'), {
  ssr: false,
  loading: () => <div className="commission-topbar-loading">Loading commission data…</div>
})

export default function CommissionTopbarButton() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  return (
    <>
      <button
        type="button"
        className="commission-topbar-button"
        onClick={() => setOpen(true)}
        aria-label="Commissions"
        title="Open life and Medicare commissions"
      >
        <span className="commission-topbar-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="8.5" />
            <path d="M15.2 8.8c-.7-.8-1.7-1.2-3-1.2-1.8 0-3 .9-3 2.2 0 1.4 1.1 2 3.1 2.4 2 .4 2.9 1 2.9 2.3 0 1.4-1.2 2.4-3.2 2.4-1.4 0-2.6-.5-3.4-1.4M12 6v12" />
          </svg>
        </span>
        <strong>Comm</strong>
      </button>

      {open ? (
        <div
          className="commission-topbar-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false)
          }}
        >
          <section className="commission-topbar-modal" role="dialog" aria-modal="true" aria-label="Commissions">
            <header className="commission-topbar-modal-head">
              <div className="commission-topbar-title">
                <span className="commission-topbar-icon large" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="8.5" />
                    <path d="M15.2 8.8c-.7-.8-1.7-1.2-3-1.2-1.8 0-3 .9-3 2.2 0 1.4 1.1 2 3.1 2.4 2 .4 2.9 1 2.9 2.3 0 1.4-1.2 2.4-3.2 2.4-1.4 0-2.6-.5-3.4-1.4M12 6v12" />
                  </svg>
                </span>
                <div><h2>Commissions</h2><p>Life Insurance and Medicare dashboard data</p></div>
              </div>
              <button type="button" className="commission-topbar-close" onClick={() => setOpen(false)} aria-label="Close commissions">×</button>
            </header>
            <div className="commission-topbar-modal-body"><CommissionQuickView /></div>
          </section>
        </div>
      ) : null}

      <style jsx global>{`
        .commission-topbar-button{appearance:none;border:0;background:transparent;padding:0;display:grid;justify-items:center;gap:2px;width:36px;min-width:36px;min-height:42px;color:#536576;cursor:pointer;font:inherit;position:relative;z-index:7;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
        .commission-topbar-button strong{font-size:.52rem;line-height:1;font-weight:900;pointer-events:none}
        .commission-topbar-icon{width:31px;height:31px;border-radius:9px;display:grid;place-items:center;background:#e8edf7;color:#405d88;border:1px solid #cbd7e8;pointer-events:none}
        .commission-topbar-icon svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
        .commission-topbar-icon.large{width:38px;height:38px;border-radius:12px;flex:none}.commission-topbar-icon.large svg{width:22px;height:22px}
        .commission-topbar-backdrop{position:fixed;inset:0;z-index:4300;background:rgba(17,28,39,.56);display:grid;place-items:center;padding:18px}
        .commission-topbar-modal{width:min(960px,96vw);height:min(820px,92dvh);background:#f7fafc;border:1px solid #cad6df;border-radius:18px;overflow:hidden;display:grid;grid-template-rows:auto minmax(0,1fr);box-shadow:0 24px 70px rgba(15,23,42,.28)}
        .commission-topbar-modal-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid #d7e0e7;background:#fff}
        .commission-topbar-title{display:flex;align-items:center;gap:10px;min-width:0}.commission-topbar-title h2{margin:0;color:#172033;font-size:1.08rem}.commission-topbar-title p{margin:2px 0 0;color:#64748b;font-size:.74rem}
        .commission-topbar-close{width:38px;height:38px;border-radius:50%;border:1px solid #d4dde5;background:#fff;color:#475569;font-size:1.65rem;line-height:1;display:grid;place-items:center;cursor:pointer}
        .commission-topbar-modal-body{overflow:auto;-webkit-overflow-scrolling:touch;padding:16px;min-height:0}
        .commission-topbar-loading{padding:36px;text-align:center;color:#64748b;font-weight:800}
        @media(max-width:720px){
          .commission-topbar-button{width:31px;min-width:31px}.commission-topbar-icon{width:30px;height:30px}.commission-topbar-icon svg{width:17px;height:17px}
          .commission-topbar-backdrop{padding:0;align-items:end}.commission-topbar-modal{width:100%;height:94dvh;max-height:none;border-radius:18px 18px 0 0;border-left:0;border-right:0;border-bottom:0}.commission-topbar-modal-head{padding:10px 12px}.commission-topbar-title p{display:none}.commission-topbar-modal-body{padding:10px}
        }
      `}</style>
    </>
  )
}
