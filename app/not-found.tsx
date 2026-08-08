import Link from 'next/link'

export default function NotFound() {
  return <main className="content"><div className="card card-pad"><h1>Not found</h1><p className="subtle">That record could not be found or you do not have permission to view it.</p><div style={{ marginTop: 16 }}><Link className="btn btn-primary" href="/clients">Clients</Link></div></div></main>
}
