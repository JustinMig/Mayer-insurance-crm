'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import { useClientRecordBootstrap } from '../../components/ClientRecordBootstrapContext'

type ProtectedField = 'security_code_destination_name'
type SavedState = Record<ProtectedField, boolean>
type RevealedState = Partial<Record<ProtectedField, string>>

type PendingNewClientCredentials = {
  created_at: number
  username: string
  password: string
  secret_answer: string
  security_code_destination_name: string
}

const PENDING_NEW_CLIENT_KEY = 'crm-pending-new-client-medicare-gov'
const emptySaved: SavedState = { security_code_destination_name: false }

function clientIdFromPath(pathname: string) {
  const match = pathname.match(/^\/clients\/([^/]+)$/)
  if (!match || match[1] === 'new') return ''
  return decodeURIComponent(match[1])
}

function pendingCredentialsForCreatedClient(clientId: string) {
  if (!clientId || typeof window === 'undefined') return null
  const query = new URLSearchParams(window.location.search)
  if (query.get('created') !== '1') return null

  try {
    const raw = window.sessionStorage.getItem(PENDING_NEW_CLIENT_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as PendingNewClientCredentials
    if (!value?.created_at || Date.now() - Number(value.created_at) > 10 * 60 * 1000) {
      window.sessionStorage.removeItem(PENDING_NEW_CLIENT_KEY)
      return null
    }
    return value
  } catch {
    window.sessionStorage.removeItem(PENDING_NEW_CLIENT_KEY)
    return null
  }
}

export default function MedicareGovCredentialsBridge() {
  const pathname = usePathname()
  const isNewClient = pathname === '/clients/new'
  const clientId = useMemo(() => clientIdFromPath(pathname), [pathname])
  const bootstrap = useClientRecordBootstrap()
  const pendingCreatedCredentials = useMemo(() => pendingCredentialsForCreatedClient(clientId), [clientId])

  const [mountNode, setMountNode] = useState<HTMLElement | null>(null)
  const [saved, setSaved] = useState<SavedState>(emptySaved)
  const [revealed, setRevealed] = useState<RevealedState>({})
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [secretAnswer, setSecretAnswer] = useState('')
  const [destinationName, setDestinationName] = useState('')
  const [recordLoaded, setRecordLoaded] = useState(false)
  const [clearFields, setClearFields] = useState<Partial<Record<ProtectedField, boolean>>>({})
  const [status, setStatus] = useState('')

  useEffect(() => {
    if (!clientId && !isNewClient) {
      setMountNode(null)
      return
    }

    let disposed = false
    let observer: MutationObserver | null = null
    let createdHost: HTMLElement | null = null

    const attach = () => {
      if (disposed) return false
      const formSelector = isNewClient ? '.add-client-form' : '.client-profile-form'
      const body = document.querySelector(`${formSelector} .section-medicare .section-body`) as HTMLElement | null
      if (!body) return false

      let host = body.querySelector('#medicare-gov-credentials-mount') as HTMLElement | null
      if (!host) {
        host = document.createElement('div')
        host.id = 'medicare-gov-credentials-mount'
        createdHost = host

        const effectiveDatesGroup = Array.from(body.querySelectorAll<HTMLElement>('.intake-group')).find((child) =>
          child.textContent?.includes('Medicare Effective Dates')
        )

        if (effectiveDatesGroup?.parentElement === body && effectiveDatesGroup.nextSibling) body.insertBefore(host, effectiveDatesGroup.nextSibling)
        else body.appendChild(host)
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
      if (createdHost?.isConnected) createdHost.remove()
      setMountNode(null)
    }
  }, [clientId, isNewClient])

  useEffect(() => {
    setRevealed({})
    setUsername('')
    setPassword('')
    setSecretAnswer('')
    setDestinationName('')
    setRecordLoaded(false)
    setClearFields({})
    setStatus('')
  }, [clientId, isNewClient])

  useEffect(() => {
    if (isNewClient || !clientId || pendingCreatedCredentials) return
    if (bootstrap?.error) {
      setStatus(bootstrap.error)
      return
    }
    if (!bootstrap?.data) return

    const medicareGov = bootstrap.data.medicare_gov
    setUsername(String(medicareGov.values.username || ''))
    setPassword(String(medicareGov.values.password || ''))
    setSecretAnswer(String(medicareGov.values.secret_answer || ''))
    setSaved({
      security_code_destination_name: Boolean(medicareGov.saved.security_code_destination_name)
    })
    setRecordLoaded(true)
    setStatus('')
  }, [bootstrap?.data, bootstrap?.error, clientId, isNewClient, pendingCreatedCredentials])

  useEffect(() => {
    if (!isNewClient || !mountNode) return
    const form = document.querySelector<HTMLFormElement>('.add-client-form')
    if (!form) return

    const remember = () => {
      const data = new FormData(form)
      const pending: PendingNewClientCredentials = {
        created_at: Date.now(),
        username: String(data.get('medicare_gov_username') || '').trim(),
        password: String(data.get('medicare_gov_password') || '').trim(),
        secret_answer: String(data.get('medicare_gov_secret_answer') || '').trim(),
        security_code_destination_name: String(data.get('medicare_gov_security_code_destination_name') || '').trim()
      }
      window.sessionStorage.setItem(PENDING_NEW_CLIENT_KEY, JSON.stringify(pending))
    }

    form.addEventListener('submit', remember, true)
    return () => form.removeEventListener('submit', remember, true)
  }, [isNewClient, mountNode])

  useEffect(() => {
    if (!clientId || !pendingCreatedCredentials) return
    let cancelled = false

    setUsername(pendingCreatedCredentials.username)
    setPassword(pendingCreatedCredentials.password)
    setSecretAnswer(pendingCreatedCredentials.secret_answer)
    setDestinationName('')
    setSaved({
      security_code_destination_name: Boolean(pendingCreatedCredentials.security_code_destination_name)
    })
    setRecordLoaded(true)

    const hasAnyValue = Boolean(
      pendingCreatedCredentials.username ||
      pendingCreatedCredentials.password ||
      pendingCreatedCredentials.secret_answer ||
      pendingCreatedCredentials.security_code_destination_name
    )

    if (!hasAnyValue) {
      window.sessionStorage.removeItem(PENDING_NEW_CLIENT_KEY)
      return
    }

    void (async () => {
      try {
        const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/medicare-gov`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({
            action: 'save',
            username: pendingCreatedCredentials.username,
            password: pendingCreatedCredentials.password,
            secret_answer: pendingCreatedCredentials.secret_answer,
            security_code_destination_name: pendingCreatedCredentials.security_code_destination_name
          })
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || 'Unable to save Medicare.gov information from the intake form.')
        if (cancelled) return
        window.sessionStorage.removeItem(PENDING_NEW_CLIENT_KEY)
        setStatus('')
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : 'Unable to save Medicare.gov information from the intake form.')
      }
    })()

    return () => { cancelled = true }
  }, [clientId, pendingCreatedCredentials])

  async function reveal(field: ProtectedField) {
    if (!clientId) return
    if (revealed[field] !== undefined) {
      setRevealed(current => {
        const next = { ...current }
        delete next[field]
        return next
      })
      return
    }

    setStatus('')
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/medicare-gov`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ action: 'reveal', field })
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to show saved value.')
      setRevealed(current => ({ ...current, [field]: data.value || 'Not saved' }))
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to show saved value.')
    }
  }

  function toggleClear(field: ProtectedField, checkedValue: boolean) {
    setClearFields(current => ({ ...current, [field]: checkedValue }))
    setRevealed(current => {
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  if ((!clientId && !isNewClient) || !mountNode) return null

  const protectedField = (
    key: ProtectedField,
    formName: string,
    clearName: string,
    label: string,
    fieldValue: string,
    setter: (value: string) => void,
    placeholder = ''
  ) => (
    <div className="label medicare-gov-field">
      <span>{label}</span>
      {saved[key] ? (
        <div className="medicare-gov-saved-line">
          <span className="medicare-gov-saved-value">{revealed[key] ?? '✓ Saved securely'}</span>
          <button type="button" className="btn btn-secondary btn-small" onClick={() => void reveal(key)}>
            {revealed[key] !== undefined ? 'Hide' : 'Show'}
          </button>
        </div>
      ) : null}
      <input
        className="input"
        name={formName}
        type="text"
        autoComplete="off"
        value={fieldValue}
        onChange={(event) => setter(event.target.value)}
        placeholder={saved[key] ? `Saved — type here only to replace the ${label.toLowerCase()}` : placeholder}
      />
      {saved[key] ? (
        <label className="clear-sensitive">
          <input
            type="checkbox"
            name={clearName}
            checked={Boolean(clearFields[key])}
            onChange={(event) => toggleClear(key, event.target.checked)}
          />
          Clear saved {label.toLowerCase()}
        </label>
      ) : null}
    </div>
  )

  return createPortal(
    <div className="intake-group medicare-gov-group">
      <div className="intake-group-heading">
        <div>
          <strong>Medicare.gov</strong>
          <span>Username, password, and Secret Answer are visible and directly editable. Saved values remain encrypted in storage.</span>
        </div>
      </div>

      <div className="form-grid medicare-gov-grid">
        <label className="label medicare-gov-field">
          <span>Username</span>
          <input className="input" name="medicare_gov_username" type="text" autoComplete="off" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Medicare.gov username" />
          {!isNewClient ? <input type="hidden" name="clear_medicare_gov_username" value={recordLoaded && !username.trim() ? 'on' : ''} /> : null}
        </label>
        <label className="label medicare-gov-field">
          <span>Password</span>
          <input className="input" name="medicare_gov_password" type="text" autoComplete="off" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Medicare.gov password" />
          {!isNewClient ? <input type="hidden" name="clear_medicare_gov_password" value={recordLoaded && !password.trim() ? 'on' : ''} /> : null}
        </label>
        <label className="label medicare-gov-field">
          <span>Secret Answer</span>
          <input className="input" name="medicare_gov_secret_answer" type="text" autoComplete="off" value={secretAnswer} onChange={(event) => setSecretAnswer(event.target.value)} placeholder="Security question answer" />
          {!isNewClient ? <input type="hidden" name="clear_medicare_gov_secret_answer" value={recordLoaded && !secretAnswer.trim() ? 'on' : ''} /> : null}
        </label>
        {protectedField('security_code_destination_name', 'medicare_gov_security_code_destination_name', 'clear_medicare_gov_security_code_destination_name', 'Security Code Destination Name', destinationName, setDestinationName, 'Example: Mary’s cell phone or Gmail')}
      </div>

      {status ? <div className="medicare-gov-status">{status}</div> : null}

      <style jsx global>{`
        .medicare-gov-group{background:#f7f8f6;border:1px solid #d9dfd6;border-radius:13px;padding:14px}
        .medicare-gov-grid{margin-top:10px}
        .medicare-gov-field{background:#fff;border:1px solid #dfe4dc;border-radius:11px;padding:11px}
        .medicare-gov-saved-line{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px}
        .medicare-gov-saved-value{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#2f6842;font-size:.82rem;font-weight:800}
        .medicare-gov-status{margin-top:10px;color:#8a4a3b;font-size:.82rem;font-weight:700}
      `}</style>
    </div>,
    mountNode
  )
}
