'use client'

import { useState } from 'react'

type SensitiveField = 'ssn' | 'drivers_license' | 'medicare_number' | 'medicaid_number' | 'health_member_id' | 'bank_routing_number' | 'bank_account_number' | 'bank_debit_card_number'

export default function SensitiveReveal({
  clientId,
  field,
  masked
}: {
  clientId: string
  field: SensitiveField
  masked: string
}) {
  const [revealed, setRevealed] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function showValue() {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/sensitive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ field })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error || 'Unable to reveal value')
      setRevealed(data?.value || 'Not saved')
    } catch (err) {
      setRevealed(null)
      setError(err instanceof Error ? err.message : 'Unable to reveal value')
    } finally {
      setLoading(false)
    }
  }

  function hideValue() {
    setRevealed(null)
    setError('')
  }

  return (
    <div className="sensitive-reveal" aria-live="polite">
      <div className="sensitive-display">
        <span className={revealed ? 'sensitive-value sensitive-value-revealed' : 'sensitive-value'}>
          {revealed ?? masked}
        </span>
        {revealed ? (
          <button type="button" className="btn btn-secondary sensitive-button" onClick={hideValue}>Hide</button>
        ) : (
          <button type="button" className="btn btn-secondary sensitive-button" onClick={showValue} disabled={loading || masked === 'Not saved'}>
            {loading ? 'Showing…' : 'Show'}
          </button>
        )}
      </div>
      {error ? <span className="field-error">{error}</span> : null}
      <span className="field-help">Sensitive values are hidden by default. Reveals are recorded in the CRM audit log.</span>
    </div>
  )
}
