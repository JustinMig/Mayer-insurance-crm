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
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')

  useEffect(() => {
    if (!clientId) {
      setMountNode(null)
      return
    }

    let disposed = false
    const attach = () => {
      if (disposed) return
      const body = document.querySelector('.client-profile-form .section-medicare .section-body') as HTMLElement | null
      if (!body) return

      let host = body.querySelector('#medicare-gov-credentials-mount') as HTMLElement | null
      if (!host) {
        host = document.createElement('div')
        host.id = 'medicare-gov-credentials-mount'
        const firstGroup = body.querySelector('.intake-group')
        if (firstGroup?.nextSibling) body.insertBefore(host, firstGroup.nextSibling)
        else body.appendChild(host)
      }
      setMountNode(host)
    }

    attach()
    const observer = new MutationObserver(attach)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      disposed = true
      observer.disconnect()
      const host = document.getElementById('medicare-gov-credentials-mount')
      if (host) host.remove()
      setMountNode(null)
    }
  }, [clientId])

  async function loadSavedState() {
    if (!clientId) return
    setLoading(true)
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/medicare-gov`, { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to load Medicare.gov information.')
      setSaved({ ...emptySaved, ...(data.saved || {}) })
      setStatus('')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to load Medicare.gov information.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setSaved(emptySaved)
    setRevealed({})
    setUsername('')
    setPassword('')
    setSecretAnswer('')
    setDestinationName('')
    setClearFields({})
    setStatus('')
    if (clientId) void loadSavedState()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  function toggleClear(field: CredentialField, checked: boolean) {
    setClearFields(current => ({ ...current, [field]: checked }))
    setRevealed(current => {
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  async function saveCredentials() {
    if (!clientId || saving) return
    setSaving(true)
    setStatus('Saving Medicare.gov information…')
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/medicare-gov`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          action: 'save',
          username,
          password,
          secret_answer: secretAnswer,
          security_code_destination_name: destinationName,
          clear_username: Boolean(clearFields.username),
          clear_password: Boolean(clearFields.password),
          clear_secret_answer: Boolean(clearFields.secret_answer),
          clear_security_code_destination_name: Boolean(clearFields.security_code_destination_name)
        })
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to save Medicare.gov information.')

      setUsername('')
      setPassword('')
      setSecretAnswer('')
      setDestinationName('')
      setClearFields({})
      setRevealed({})
      await loadSavedState()
      setStatus('Medicare.gov information saved.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to save Medicare.gov information.')
    } finally {
      setSaving(false)
    }
  }

  if (!clientId || !mountNode) return null

  const field = (
    key: CredentialField,
    label: string,
    value: string,
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
        type={type}
        autoComplete="off"
        value={value}
        onChange={(event) => setter(event.target.value)}
        placeholder={saved[key] ? `Enter a new ${label.toLowerCase()} only to replace the saved value` : placeholder}
      />
      {saved[key] ? (
        <label className="clear-sensitive">
          <input type="checkbox" checked={Boolean(clearFields[key])} onChange={(event) => toggleClear(key, event.target.checked)} />
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
        {field('username', 'Username', username, setUsername, 'text', 'Medicare.gov username')}
        {field('password', 'Password', password, setPassword, 'password', 'Medicare.gov password')}
        {field('secret_answer', 'Secret Answer', secretAnswer, setSecretAnswer, 'password', 'Security question answer')}
        {field('security_code_destination_name', 'Security Code Destination Name', destinationName, setDestinationName, 'text', 'Example: Mary’s cell phone or Gmail')}
      </div>

      <div className="medicare-gov-actions">
        {status ? <span className={status.includes('saved') ? 'medicare-gov-status success' : 'medicare-gov-status'}>{status}</span> : null}
        <button type="button" className="btn btn-primary" disabled={saving || loading} onClick={() => void saveCredentials()}>
          {saving ? 'Saving…' : 'SAVE MEDICARE.GOV'}
        </button>
      </div>

      <style jsx global>{`
        .medicare-gov-group{background:#f7f8f6;border:1px solid #d9dfd6;border-radius:13px;padding:14px}
        .medicare-gov-grid{margin-top:10px}
        .medicare-gov-field{background:#fff;border:1px solid #dfe4dc;border-radius:11px;padding:11px}
        .medicare-gov-saved-line{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px}
        .medicare-gov-saved-value{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#4b5563;font-size:.82rem;font-weight:700}
        .medicare-gov-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px;flex-wrap:wrap}
        .medicare-gov-status{color:#8a4a3b;font-size:.82rem;font-weight:700}
        .medicare-gov-status.success{color:#47664e}
        @media(max-width:720px){.medicare-gov-actions .btn{width:100%}.medicare-gov-status{width:100%}}
      `}</style>
    </div>,
    mountNode
  )
}
