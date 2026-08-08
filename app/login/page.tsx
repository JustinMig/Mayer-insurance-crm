'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') || '').trim()
    const password = String(form.get('password') || '')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    router.replace('/dashboard')
    router.refresh()
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <img className="login-bear" src="/mayer-bear.png" alt="Mayer Insurance Group bear" />
        <h1>Mayer Insurance Group</h1>
        <p className="subtle">Secure CRM access</p>
        <form onSubmit={submit}>
          {error ? <div className="notice notice-error">{error}</div> : null}
          <label className="label">Email<input className="input" type="email" name="email" required autoComplete="username" /></label>
          <label className="label">Password<input className="input" type="password" name="password" required autoComplete="current-password" /></label>
          <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </section>
    </main>
  )
}
