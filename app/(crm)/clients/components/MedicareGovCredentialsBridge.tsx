'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'

type CredentialField = 'username' | 'password' | 'secret_answer' | 'security_code_destination_name'
type SavedState = Record<CredentialField, boolean>
type RevealedState = Partial<Record<CredentialField, string>>

const emptySaved: SavedState = {
  username: false,
  password: false,
  secret_answer: false,
  security_code_destination_name: false
}

function clientIdFromPath(pathname: string) {
  const match = pathname.match(/^\/clients\/([^/]+)$/)
  if (!match || match[1] === 'new') return ''
  return decodeURIComponent(match[1])
}

export default function MedicareGovCredentialsBridge() {
  const pathname = usePathname()
  const clientId = useMemo(() => clientIdFromPath(pathname), [pathname])
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null)
  const [saved, setSaved] = useState<SavedState>(emptySaved)
  const [revealed, setRevealed] = useState<RevealedState>({})
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [secretAnswer, setSecretAnswer] = useState('')
  const [destinationName, setDestinationName] = useState('')
  const [clearFields, setClearFields] = useState<Partial<Record<CredentialField, boolean>>>({})
  const [status, setStatus] = useState('')

  useEffect(() => {
    if (!clientId) {
      setMountNode(null)
      return
    }

    let disposed = false
    let observer: MutationObserver | null = null

    const attach = () => {
      if (disposed) return false
      const body = document.querySelector('.client-profile-form .section-medicare .section-body') as HTMLElement | null
      if (!body) return false

      let host = body.querySelector('#medicare-gov-credentials-mount') as HTMLElement | null
      if (!host) {
        host = document.createElement('div')
        host.id = 'medicare-gov-credentials-mount'

        const effectiveDatesGroup = Array.from(body.children).find((child) =>
          child.classList.contains('intake-group') && child.textContent?.includes('Medicare Effective Dates')
        )

        if (effectiveDatesGroup?.nextSibling) body.insertBefore(host, effectiveDatesGroup.nextSibling)
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
      document.getElementById('medicare-gov-credentials-mount')?.remove()
      setMountNode(null)
    }
  }, [clientId])

  useEffect(() => {
    setSaved(emptySaved)
    setRevealed({})
    setUsername('')
    setPassword('')
    setSecretAnswer('')
    setDestinationName('')
    setClearFields({})
    setStatus('')
    if (!clientId) return

    let cancelled = false
    void (async () => {
      try {
        const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/medicare-gov`, { cache: 'no-store' })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || 'Unable to load Medicare.gov information.')
        if (!cancelled) setSaved({ ...emptySaved, ...(data.saved || {}) })
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : 'Unable to load Medicare.gov information.')
      }
    })()

    return () => { cancelled = true }
  }, [clientId])

  async function reveal(field: CredentialField) {
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

  function toggleClear(field: CredentialField, checkedValue: boolean) {
    setClearFields(current => ({ ...current, [field]: checkedValue }))
    setRevealed(current => {
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  if (!clientId || !mountNode) return null

  const field = (
    key: CredentialField,
    formName: string,
    clearName: string,
    label: string,
    fieldValue: string,
    setter: (value: string) => void,
    type: 'text' | 'password' = 'text',
    placeholder = ''
  ) => (
    <div className="label medicare-gov-field">
      <span>{label}</span>
      {saved[key] ? (
        <div className="medicare-gov-saved-line">
          <span className="medicare-gov-saved-value">{revealed[key] ?? 'Saved securely'}</span>
          <button type="button" className="btn btn-secondary btn-small" onClick={() => void reveal(key)}>
            {revealed[key] !== undefined ? 'Hide' : 'Show'}
          </button>
        </div>
      ) : null}
      <input
        className="input"
        name={formName}
        type={type}
        autoComplete="off"
        value={fieldValue}
        onChange={(event) => setter(event.target.value)}
        placeholder={saved[key] ? `Enter a new ${label.toLowerCase()} only to replace the saved value` : placeholder}
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
          <span>Login and verification information. Sensitive values are encrypted and hidden by default.</span>
        </div>
      </div>

      <div className="form-grid medicare-gov-grid">
        {field('username', 'medicare_gov_username', 'clear_medicare_gov_username', 'Username', username, setUsername, 'text', 'Medicare.gov username')}
        {field('password', 'medicare_gov_password', 'clear_medicare_gov_password', 'Password', password, setPassword, 'password', 'Medicare.gov password')}
        {field('secret_answer', 'medicare_gov_secret_answer', 'clear_medicare_gov_secret_answer', 'Secret Answer', secretAnswer, setSecretAnswer, 'password', 'Security question answer')}
        {field('security_code_destination_name', 'medicare_gov_security_code_destination_name', 'clear_medicare_gov_security_code_destination_name', 'Security Code Destination Name', destinationName, setDestinationName, 'text', 'Example: Mary’s cell phone or Gmail')}
      </div>

      {status ? <div className="medicare-gov-status">{status}</div> : null}

      <style jsx global>{`
        .medicare-gov-group{background:#f7f8f6;border:1px solid #d9dfd6;border-radius:13px;padding:14px}
        .medicare-gov-grid{margin-top:10px}
        .medicare-gov-field{background:#fff;border:1px solid #dfe4dc;border-radius:11px;padding:11px}
        .medicare-gov-saved-line{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px}
        .medicare-gov-saved-value{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#4b5563;font-size:.82rem;font-weight:700}
        .medicare-gov-status{margin-top:10px;color:#8a4a3b;font-size:.82rem;font-weight:700}
      `}</style>
    </div>,
    mountNode
  )
}
