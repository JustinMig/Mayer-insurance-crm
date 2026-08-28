'use client'

import dynamic from 'next/dynamic'
import { useState, type SyntheticEvent } from 'react'

const CompanyDirectory = dynamic(() => import('./CompanyDirectory'), {
  ssr: false,
  loading: () => <div className="dashboard-deferred-loading">Loading company directory…</div>
})

const BuildChartLookup = dynamic(() => import('./BuildChartLookup'), {
  ssr: false,
  loading: () => <div className="dashboard-deferred-loading">Loading height and weight charts…</div>
})

export default function DeferredDashboardTools() {
  const [directoryLoaded, setDirectoryLoaded] = useState(false)
  const [buildLoaded, setBuildLoaded] = useState(false)

  function activateDirectory(event: SyntheticEvent<HTMLDetailsElement>) {
    if (event.currentTarget.open) setDirectoryLoaded(true)
  }

  function activateBuild(event: SyntheticEvent<HTMLDetailsElement>) {
    if (event.currentTarget.open) setBuildLoaded(true)
  }

  return (
    <section className="dashboard-deferred-tools" aria-label="Dashboard lookup tools">
      <details className="dashboard-deferred-tool" onToggle={activateDirectory}>
        <summary>
          <span>Company Contact Directory</span>
          <small>Loads when opened</small>
        </summary>
        <div className="dashboard-deferred-tool-body">
          {directoryLoaded ? <CompanyDirectory /> : null}
        </div>
      </details>

      <details className="dashboard-deferred-tool" onToggle={activateBuild}>
        <summary>
          <span>Height &amp; Weight Underwriting Lookup</span>
          <small>Loads when opened</small>
        </summary>
        <div className="dashboard-deferred-tool-body">
          {buildLoaded ? <BuildChartLookup /> : null}
        </div>
      </details>
    </section>
  )
}
