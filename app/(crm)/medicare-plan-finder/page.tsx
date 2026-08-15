import MedicarePlanFinder from './MedicarePlanFinder'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function MedicarePlanFinderPage() {
  return (
    <>
      <div className="clients-page-heading medicare-page-heading">
        <h1>Medicare Plan Finder</h1>
        <p className="subtle">Search Mississippi Medicare Advantage plans, compare benefits, and check selected doctor office locations against verified plan-network records.</p>
      </div>
      <MedicarePlanFinder />
    </>
  )
}
