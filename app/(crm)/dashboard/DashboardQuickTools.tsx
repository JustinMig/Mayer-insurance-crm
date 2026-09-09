'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import DashboardNotes from './DashboardNotes'

const AppointmentQuickSetter = dynamic(() => import('./AppointmentQuickSetter'), {
  ssr: false,
  loading: () => <div className="dashboard-quick-loading">Loading appointment setter…</div>
})

const CompanyDirectory = dynamic(() => import('./CompanyDirectory'), {
  ssr: false,
  loading: () => <div className="dashboard-quick-loading">Loading company directory…</div>
})

const BuildChartLookup = dynamic(() => import('./BuildChartLookup'), {
  ssr: false,
  loading: () => <div className="dashboard-quick-loading">Loading height &amp; weight chart…</div>
})

type ToolKey = 'appointments' | 'notes' | 'fex' | 'directory' | 'build'

type Tool = {
  key: ToolKey
  label: string
  shortLabel: string
  hint: string
  icon: React.ReactNode
}

const tools: Tool[] = [
  {
    key: 'appointments',
    label: 'Appointments',
    shortLabel: 'Appt',
    hint: 'Set an appointment',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="5.5" width="16" height="14.5" rx="2" />
        <path d="M8 3.5v4M16 3.5v4M4 9.5h16M8 13h3M13 13h3M8 16.5h3M13 16.5h3" />
      </svg>
    )
  },
  {
    key: 'notes',
    label: 'Notes',
    shortLabel: 'Notes',
    hint: 'Open dashboard notes',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6.5 3.75h8.9l3.1 3.1v13.4H6.5z" />
        <path d="M15.4 3.75v3.1h3.1M9 11h7M9 14.5h7M9 18h4.5" />
      </svg>
    )
  },
  {
    key: 'fex',
    label: 'FEX Quotes',
    shortLabel: 'FEX',
    hint: 'Open final expense quoter',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 4.5h14v15H5z" />
        <path d="M8 8h8M8 12h3M13 12h3M8 16h3M13 16h3" />
      </svg>
    )
  },
  {
    key: 'directory',
    label: 'Company Directory',
    shortLabel: 'Dir',
    hint: 'Find carrier contacts',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="8" cy="8" r="2.7" />
        <circle cx="16.3" cy="9" r="2.1" />
        <path d="M3.9 18.5c.5-3 2-4.7 4.1-4.7s3.6 1.7 4.1 4.7M12.8 18.5c.4-2.3 1.6-3.7 3.5-3.7 1.8 0 3 1.4 3.6 3.7" />
      </svg>
    )
  },
  {
    key: 'build',
    label: 'Height & Weight',
    shortLabel: 'H&W',
    hint: 'Open underwriting chart',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 3.5v17M7 6h4M7 10h3M7 14h4M7 18h3" />
        <path d="M14.3 8.5h4.2l1.5 11h-7.2z" />
        <path d="M14.8 8.5a1.6 1.6 0 0 1 3.2 0" />
      </svg>
    )
  }
]

function NotesOverlay() {
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const button = hostRef.current?.querySelector<HTMLButtonElement>('.dashboard-notes-tab')
      if (button && button.getAttribute('aria-expanded') !== 'true') button.click()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  return <div ref={hostRef} className="dashboard-quick-notes-host"><DashboardNotes /></div>
}

function ToolBody({ active }: { active: ToolKey }) {
  if (active === 'appointments') return <AppointmentQuickSetter />
  if (active === 'notes') return <NotesOverlay />
  if (active === 'directory') return <CompanyDirectory />
  if (active === 'build') return <BuildChartLookup />
  return (
    <div className="dashboard-quick-fex">
      <iframe
        src="/api/fex-embed"
        title="FEX Quotes final expense quoter"
        loading="eager"
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-forms allow-scripts"
      />
    </div>
  )
}

export default function DashboardQuickTools({ compact = false }: { compact?: boolean }) {
  const [active, setActive] = useState<ToolKey | null>(null)

  useEffect(() => {
    if (!active) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActive(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [active])

  const activeTool = active ? tools.find((tool) => tool.key === active) || null : null

  return (
    <>
      <nav className={`dashboard-quick-tools${compact ? ' compact' : ''}`} aria-label="CRM quick tools">
        {tools.map((tool) => (
          <button
            key={tool.key}
            type="button"
            className={`dashboard-quick-tool dashboard-quick-tool-${tool.key}`}
            onClick={() => setActive(tool.key)}
            title={tool.hint}
            aria-label={tool.label}
          >
            <span className="dashboard-quick-icon">{tool.icon}</span>
            <strong>{compact ? tool.shortLabel : tool.label}</strong>
          </button>
        ))}
      </nav>

      {active && activeTool ? (
        <div
          className="dashboard-quick-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setActive(null)
          }}
        >
          <section className={`dashboard-quick-modal dashboard-quick-modal-${active}`} role="dialog" aria-modal="true" aria-label={activeTool.label}>
            <header className="dashboard-quick-modal-head">
              <div className={`dashboard-quick-modal-title dashboard-quick-tool-${active}`}>
                <span className="dashboard-quick-icon small">{activeTool.icon}</span>
                <div><h2>{activeTool.label}</h2><p>{activeTool.hint}</p></div>
              </div>
              <button type="button" className="dashboard-quick-close" onClick={() => setActive(null)} aria-label={`Close ${activeTool.label}`}>×</button>
            </header>
            <div className="dashboard-quick-modal-body">
              <ToolBody active={active} />
            </div>
          </section>
        </div>
      ) : null}

      <style jsx global>{`
        .dashboard-quick-tools{display:flex;align-items:flex-start;gap:22px;flex-wrap:wrap;margin:12px 0 2px;padding:2px 2px 8px}
        .dashboard-quick-tools.compact{margin:0 0 0 10px;padding:0;gap:5px;flex:1 1 auto;min-width:0;flex-wrap:nowrap;align-items:center;justify-content:flex-end;overflow:visible;position:relative;z-index:5}
        .dashboard-quick-tools.compact .dashboard-quick-tool{min-width:34px;padding:0;display:grid;justify-items:center;gap:2px;position:relative;z-index:6;pointer-events:auto;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
        .dashboard-quick-tools.compact .dashboard-quick-tool strong{display:block;font-size:.56rem;line-height:1;font-weight:900;white-space:nowrap;max-width:none;color:#536576}
        .dashboard-quick-tools.compact .dashboard-quick-icon{width:34px;height:34px;border-radius:10px;pointer-events:none}
        .dashboard-quick-tools.compact .dashboard-quick-icon svg{width:18px;height:18px;pointer-events:none}
        .dashboard-quick-tool{appearance:none;border:0;background:transparent;padding:3px 2px;display:grid;justify-items:center;gap:7px;min-width:84px;color:#34485a;cursor:pointer;font:inherit}
        .dashboard-quick-tool strong{font-size:.74rem;line-height:1.08;text-align:center;max-width:100px;pointer-events:none}
        .dashboard-quick-icon{width:56px;height:56px;border-radius:18px;display:grid;place-items:center;background:#e7edf2;color:#365268;border:1px solid #ccd8e1;transition:transform .12s ease,background .12s ease}
        .dashboard-quick-icon svg{width:29px;height:29px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
        .dashboard-quick-tool:hover .dashboard-quick-icon,.dashboard-quick-tool:focus-visible .dashboard-quick-icon{transform:translateY(-2px);background:#dce6ed}
        .dashboard-quick-tool-appointments .dashboard-quick-icon{background:#e5edf7;color:#355b86;border-color:#c7d7e9}
        .dashboard-quick-tool-notes .dashboard-quick-icon{background:#e6edf3;color:#3b5870;border-color:#cbd8e2}
        .dashboard-quick-tool-fex .dashboard-quick-icon{background:#f3e6e7;color:#8b3940;border-color:#e2c9cc}
        .dashboard-quick-tool-directory .dashboard-quick-icon{background:#e7efe8;color:#46624b;border-color:#cfddcf}
        .dashboard-quick-tool-build .dashboard-quick-icon{background:#eee9df;color:#665942;border-color:#ddd2bd}
        .dashboard-quick-backdrop{position:fixed;inset:0;z-index:4200;background:rgba(17,28,39,.54);display:grid;place-items:center;padding:18px}
        .dashboard-quick-modal{width:min(980px,96vw);height:min(820px,92dvh);background:#f8fafb;border:1px solid #cbd5df;border-radius:18px;overflow:hidden;display:grid;grid-template-rows:auto minmax(0,1fr)}
        .dashboard-quick-modal-fex{width:min(1120px,97vw);height:min(900px,94dvh)}
        .dashboard-quick-modal-appointments{width:min(820px,96vw);height:auto;max-height:92dvh}
        .dashboard-quick-modal-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid #d7e0e7;background:#fff}
        .dashboard-quick-modal-title{display:flex;align-items:center;gap:10px;min-width:0}
        .dashboard-quick-modal-title h2{margin:0;font-size:1.08rem;color:#172033}.dashboard-quick-modal-title p{margin:2px 0 0;color:#64748b;font-size:.75rem}
        .dashboard-quick-icon.small{width:38px;height:38px;border-radius:12px;flex:none}.dashboard-quick-icon.small svg{width:21px;height:21px}
        .dashboard-quick-close{width:38px;height:38px;border-radius:50%;border:1px solid #d4dde5;background:#fff;color:#475569;font-size:1.65rem;line-height:1;display:grid;place-items:center;cursor:pointer}
        .dashboard-quick-close:hover{background:#eef2f5}
        .dashboard-quick-modal-body{overflow:auto;-webkit-overflow-scrolling:touch;padding:16px;min-height:0}
        .dashboard-quick-notes-host .dashboard-notes-shell{margin-top:0}
        .dashboard-quick-notes-host .dashboard-notes-tab{display:none!important}
        .dashboard-quick-notes-host .dashboard-notes-panel{display:block!important;border-radius:14px!important;border-top:1px solid #cbd5e1!important}
        .dashboard-quick-modal-body .company-directory-card,.dashboard-quick-modal-body .build-lookup-card{margin-top:0!important;box-shadow:none!important}
        .dashboard-quick-loading{padding:28px;text-align:center;color:#64748b;font-weight:800}
        .dashboard-quick-fex{height:100%;min-height:680px;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #d8e1e8}
        .dashboard-quick-fex iframe{display:block;width:100%;height:100%;min-height:680px;border:0;background:#fff}
        @media(max-width:720px){
          .dashboard-quick-tools{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-top:8px;padding-bottom:4px}
          .dashboard-quick-tool{min-width:0;width:100%;padding:2px 0;gap:5px}.dashboard-quick-tool strong{font-size:.64rem;max-width:76px}
          .dashboard-quick-icon{width:48px;height:48px;border-radius:15px}.dashboard-quick-icon svg{width:25px;height:25px}
          .dashboard-quick-backdrop{padding:0;align-items:end}
          .dashboard-quick-modal,.dashboard-quick-modal-fex,.dashboard-quick-modal-appointments,.dashboard-quick-modal-build{width:100%;height:94dvh;max-height:none;border-radius:18px 18px 0 0;border-left:0;border-right:0;border-bottom:0}
          .dashboard-quick-modal-head{padding:10px 12px}.dashboard-quick-modal-title p{display:none}.dashboard-quick-modal-body{padding:10px}
          .dashboard-quick-fex,.dashboard-quick-fex iframe{min-height:calc(94dvh - 78px);height:100%}
          .dashboard-quick-tools.compact{display:flex!important;grid-template-columns:none;gap:4px;margin:0 0 0 4px;padding:0;justify-content:flex-end;overflow:visible!important}
          .dashboard-quick-tools.compact .dashboard-quick-tool{width:31px;min-width:31px;min-height:42px}
          .dashboard-quick-tools.compact .dashboard-quick-icon{width:30px;height:30px;border-radius:9px}
          .dashboard-quick-tools.compact .dashboard-quick-icon svg{width:17px;height:17px}
          .dashboard-quick-tools.compact .dashboard-quick-tool strong{font-size:.52rem}
        }
      `}</style>
    </>
  )
}
