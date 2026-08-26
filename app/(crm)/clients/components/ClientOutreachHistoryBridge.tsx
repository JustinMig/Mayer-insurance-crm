'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'

type Campaign = { id: string; name: string; topic: string; status: string }
type Membership = {
  id: string
  campaign_id: string
  status: string
  last_outcome: string | null
  last_note: string | null
  last_contacted_at: string | null
  next_action: string | null
  follow_up_date: string | null
  follow_up_time: string | null
  attempt_count: number
  campaign: Campaign | null
}
type Interaction = {
  id: string
  campaign_id: string
  outcome: string
  note: string | null
  next_action: string | null
  follow_up_date: string | null
  follow_up_time: string | null
  created_at: string
  campaign: Campaign | null
}

function clientIdFromPath(pathname: string) {
  const match = pathname.match(/^\/clients\/([^/]+)$/)
  if (!match || match[1] === 'new') return ''
  return decodeURIComponent(match[1])
}

function statusLabel(value: string) {
  if (value === 'not_contacted') return 'Not Contacted'
  if (value === 'attempted') return 'Attempted'
  if (value === 'spoke') return 'Spoke With Client'
  if (value === 'follow_up') return 'Follow-Up Needed'
  if (value === 'completed') return 'Completed'
  if (value === 'not_interested') return 'Not Interested'
  if (value === 'do_not_call') return 'Do Not Call'
  if (value === 'unreachable') return 'Unreachable'
  if (value === 'no_answer') return 'No Answer'
  if (value === 'voicemail') return 'Voicemail'
  if (value === 'busy') return 'Busy'
  if (value === 'bad_number') return 'Bad Number'
  return value
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value.includes('T') ? value : `${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date)
}

export default function ClientOutreachHistoryBridge() {
  const pathname = usePathname()
  const clientId = useMemo(() => clientIdFromPath(pathname), [pathname])
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null)
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [interactions, setInteractions] = useState<Interaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!clientId) return
    let disposed = false
    let observer: MutationObserver | null = null

    const attach = () => {
      if (disposed) return false
      const form = document.querySelector<HTMLElement>('.client-profile-form')
      const notes = form?.querySelector<HTMLElement>('.section-notes')
      if (!form || !notes) return false
      let host = form.querySelector<HTMLElement>('#client-outreach-history-mount')
      if (!host) {
        host = document.createElement('div')
        host.id = 'client-outreach-history-mount'
        form.insertBefore(host, notes)
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
      document.getElementById('client-outreach-history-mount')?.remove()
      setMountNode(null)
    }
  }, [clientId])

  useEffect(() => {
    if (!clientId) return
    let cancelled = false
    setLoading(true)
    setError('')
    void (async () => {
      try {
        const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/outreach-history`, { cache: 'no-store' })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || 'Unable to load outreach history.')
        if (!cancelled) {
          setMemberships(Array.isArray(data.memberships) ? data.memberships : [])
          setInteractions(Array.isArray(data.interactions) ? data.interactions : [])
        }
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Unable to load outreach history.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [clientId])

  if (!clientId || !mountNode) return null

  return createPortal(
    <details className="section-details section-outreach-history">
      <summary><span>Outreach &amp; Contact History</span><small>Campaigns, conversations, attempts &amp; follow-ups</small></summary>
      <div className="section-body intake-section-body outreach-history-body">
        {loading ? <div className="empty">Loading outreach history…</div> : error ? <div className="notice notice-error">{error}</div> : (
          <>
            <div className="intake-group outreach-active-campaigns">
              <div className="intake-group-heading"><div><strong>Campaign Status</strong><span>Current outreach projects involving this client.</span></div></div>
              {!memberships.length ? <div className="outreach-history-empty">This client is not currently in an outreach campaign.</div> : (
                <div className="outreach-membership-list">
                  {memberships.map((member) => (
                    <div className="outreach-membership" key={member.id}>
                      <div><strong>{member.campaign?.name || 'Campaign'}</strong><span>{member.campaign?.status === 'archived' ? 'Archived campaign' : 'Active campaign'}</span></div>
                      <span className={`outreach-history-status status-${member.status}`}>{statusLabel(member.status)}</span>
                      <div className="outreach-membership-detail">
                        <span>Attempts / touches: {Number(member.attempt_count || 0)}</span>
                        {member.last_contacted_at ? <span>Last activity: {formatDateTime(member.last_contacted_at)}</span> : null}
                        {member.follow_up_date ? <span>Follow-up: {formatDate(member.follow_up_date)}</span> : null}
                        {member.next_action ? <span>Next: {member.next_action}</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="intake-group">
              <div className="intake-group-heading"><div><strong>Recent Outreach History</strong><span>Permanent record of campaign attempts and conversations.</span></div></div>
              {!interactions.length ? <div className="outreach-history-empty">No campaign outreach has been recorded yet.</div> : (
                <div className="outreach-interaction-list">
                  {interactions.map((interaction) => (
                    <div className="outreach-interaction" key={interaction.id}>
                      <div className="outreach-interaction-head"><strong>{statusLabel(interaction.outcome)}</strong><span>{formatDateTime(interaction.created_at)}</span></div>
                      <div className="outreach-interaction-campaign">{interaction.campaign?.name || 'Outreach campaign'}</div>
                      {interaction.note ? <p>{interaction.note}</p> : null}
                      {interaction.next_action ? <div className="outreach-interaction-next"><strong>Next action:</strong> {interaction.next_action}{interaction.follow_up_date ? ` · ${formatDate(interaction.follow_up_date)}` : ''}</div> : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      <style jsx global>{`
        .outreach-history-body{display:grid;gap:12px}.outreach-history-empty{padding:12px;border:1px dashed #d8e1e7;border-radius:10px;color:#64748b;font-size:.82rem;background:#fbfcfd}.outreach-membership-list,.outreach-interaction-list{display:grid;gap:9px;margin-top:10px}.outreach-membership{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px 10px;padding:10px;border:1px solid #e0e6eb;border-radius:10px;background:#fff}.outreach-membership>div:first-child strong{display:block;color:#263746}.outreach-membership>div:first-child span{display:block;font-size:.7rem;color:#718096;margin-top:2px}.outreach-history-status{align-self:start;display:inline-flex;padding:4px 8px;border-radius:999px;border:1px solid #d8e0e6;background:#f7f9fb;color:#526271;font-size:.68rem;font-weight:900}.outreach-membership-detail{grid-column:1/-1;display:flex;gap:8px 14px;flex-wrap:wrap;color:#64748b;font-size:.74rem}.outreach-interaction{padding:10px 11px;border:1px solid #e1e7ec;border-radius:10px;background:#fff}.outreach-interaction-head{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}.outreach-interaction-head strong{color:#2c3e4f}.outreach-interaction-head span{color:#718096;font-size:.72rem}.outreach-interaction-campaign{font-size:.73rem;font-weight:800;color:#526271;margin-top:3px}.outreach-interaction p{white-space:pre-wrap;margin:8px 0 0;font-size:.8rem;color:#465767}.outreach-interaction-next{margin-top:7px;padding:7px 8px;background:#f7faf8;border-radius:8px;font-size:.76rem;color:#45604d}
      `}</style>
    </details>,
    mountNode
  )
}
