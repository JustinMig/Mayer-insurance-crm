export default function CrmLoading() {
  return (
    <section className="card card-pad crm-loading-card" aria-live="polite" aria-busy="true">
      <div className="crm-loading-bar" />
      <div className="crm-loading-bar crm-loading-bar-short" />
      <p className="subtle">Loading CRM…</p>
    </section>
  )
}
