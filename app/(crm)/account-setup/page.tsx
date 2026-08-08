import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCrmSession } from '@/lib/crm-session'

export default async function AccountSetupPage() {
  const { profile, profileError } = await getCrmSession()

  if (profile?.agency_id) redirect('/dashboard')

  return (
    <section className="card card-pad account-setup-card">
      <h1>CRM account setup needed</h1>
      <p className="subtle">
        Your sign-in works, but this CRM profile is not connected to an agency yet. An administrator needs to connect your profile before client and dashboard data can load.
      </p>
      {profileError ? <p className="notice notice-error">Profile lookup: {profileError.message}</p> : null}
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <Link prefetch={false} className="btn btn-secondary" href="/account-setup">Check again</Link>
        <form action="/auth/signout" method="post"><button className="btn btn-primary" type="submit">Sign out</button></form>
      </div>
    </section>
  )
}
