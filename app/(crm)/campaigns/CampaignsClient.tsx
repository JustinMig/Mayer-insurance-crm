'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type CampaignSummary = {
  id: string
  name: string
  topic: string
  created_at: string
  can_archive: boolean
  total: number
  not_contacted: number
  attempted: number
  spoke: number
  follow_up: number
  completed: number
  not_interested: number
  do_not_call: number
  unreachable: number
}

function topicLabel(topic: string) {
  if (topic === 'medicare') return 'Medicare'
  if (topic === 'life') return 'Life'
  if (topic === 'health') return 'Health'
  if (topic === 'retirement') return 'Retirement'
  if (topic === 'other') return 'Other'
  return 'General Client Review'
}

export default function CampaignsClient({ campaigns }: { campaigns: CampaignSummary[] }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [topic, setTopic] = useState('general')
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [message, setMessage] = useState('')

  async function createCampaign() {
    if (creating) return
    if (name.trim().length < 2) return setMessage('Enter a campaign name.')
    setCreating(true)
    setMessage('')
    try {
      const response = await fetch('/api/outreach-campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', name: name.trim(), topic })
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to create campaign.')
      setName('')
      setMessage('Campaign created. Add clients from Client Records.')
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create campaign.')
    } finally {
      setCreating(false)
    }
  }

  async function archiveCampaign(id: string, campaignName: string) {
    if (busyId) return
    if (!window.confirm(`Archive “${campaignName}”? Its history will be kept.`)) return
    setBusyId(id)
    setMessage('')
    try {
      const response = await fetch('/api/outreach-campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'archive', campaign_id: id })
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to archive campaign.')
      setMessage('Campaign archived. Historical outreach records were kept.')
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to archive campaign.')
    } finally {
      setBusyId('')
    }
  }

  return (
    <>
      <div className="outreach-page-heading">
        <div><h1>OUTREACH CAMPAIGNS</h1><p className="subtle">Know who still needs contact, who you reached, and what needs follow-up.</p></div>
        <Link prefetch={false} className="btn btn-secondary" href="/clients">ADD CLIENTS FROM RECORDS</Link>
      </div>

      <section className="card card-pad outreach-create-card">
        <div className="outreach-create-heading"><strong>Start a Campaign</strong><span>Create the purpose first, then add clients from Client Records.</span></div>
        <div className="outreach-create-grid">
          <label className="label">Campaign name<input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Example: 2026 Medicare Client Review" /></label>
          <label className="label">Topic
            <select className="select" value={topic} onChange={(event) => setTopic(event.target.value)}>
              <option value="medicare">Medicare</option>
              <option value="life">Life</option>
              <option value="health">Health</option>
              <option value="retirement">Retirement</option>
              <option value="general">General client review</option>
              <option value="other">Other</option>
            </select>
          </label>
          <button className="btn btn-primary" type="button" disabled={creating} onClick={() => void createCampaign()}>{creating ? 'Creating…' : 'CREATE CAMPAIGN'}</button>
        </div>
        {message ? <div className="notice" style={{ marginTop: 12 }}>{message}</div> : null}
      </section>

      {!campaigns.length ? (
        <section className="card"><div className="empty"><strong>No active outreach campaigns yet.</strong><br />Create one above, then select clients in Client Records and choose ADD TO CAMPAIGN.</div></section>
      ) : (
        <div className="outreach-campaign-grid">
          {campaigns.map((campaign) => {
            const closed = campaign.completed + campaign.not_interested + campaign.do_not_call + campaign.unreachable
            const contacted = campaign.spoke + campaign.follow_up + closed
            const progress = campaign.total ? Math.round((closed / campaign.total) * 100) : 0
            return (
              <section className="card outreach-campaign-card" key={campaign.id}>
                <div className="outreach-card-head">
                  <div><span className="outreach-topic">{topicLabel(campaign.topic)}</span><h2>{campaign.name}</h2></div>
                  <strong className="outreach-progress-number">{progress}%</strong>
                </div>
                <div className="outreach-progress-track"><span style={{ width: `${progress}%` }} /></div>
                <div className="outreach-card-summary">
                  <div><span>Total</span><strong>{campaign.total}</strong></div>
                  <div><span>Not Contacted</span><strong>{campaign.not_contacted}</strong></div>
                  <div><span>Attempted</span><strong>{campaign.attempted}</strong></div>
                  <div><span>Reached / Active</span><strong>{campaign.spoke + campaign.follow_up}</strong></div>
                  <div><span>Resolved</span><strong>{closed}</strong></div>
                  <div><span>Contacted</span><strong>{contacted}</strong></div>
                </div>
                <div className="outreach-card-actions">
                  <Link prefetch={false} className="btn btn-primary" href={`/campaigns/${campaign.id}`}>OPEN CAMPAIGN</Link>
                  {campaign.can_archive ? <button className="btn btn-secondary" type="button" disabled={busyId === campaign.id} onClick={() => void archiveCampaign(campaign.id, campaign.name)}>{busyId === campaign.id ? 'Archiving…' : 'ARCHIVE'}</button> : null}
                </div>
              </section>
            )
          })}
        </div>
      )}

      <style jsx global>{`
        .outreach-page-heading{display:flex;align-items:end;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:18px}.outreach-page-heading h1{margin-bottom:4px}
        .outreach-create-card{margin-bottom:16px}.outreach-create-heading strong{display:block;font-size:1.02rem}.outreach-create-heading span{display:block;color:#64748b;font-size:.82rem;margin-top:3px}.outreach-create-grid{display:grid;grid-template-columns:minmax(0,2fr) minmax(180px,1fr) auto;gap:10px;align-items:end;margin-top:12px}.outreach-create-grid .btn{min-height:42px}
        .outreach-campaign-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.outreach-campaign-card{padding:16px;min-width:0}.outreach-card-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.outreach-card-head h2{font-size:1.08rem;margin:5px 0 0;color:#172033}.outreach-topic{display:inline-flex;border:1px solid #d8e1e8;border-radius:999px;padding:4px 8px;font-size:.69rem;font-weight:900;color:#526271;background:#f8fafc;text-transform:uppercase}.outreach-progress-number{font-size:1.4rem;color:#3f5b57}.outreach-progress-track{height:8px;border-radius:999px;background:#e9eef1;overflow:hidden;margin:13px 0}.outreach-progress-track span{display:block;height:100%;background:#7f9c96;border-radius:inherit}.outreach-card-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.outreach-card-summary div{border:1px solid #e1e7ec;border-radius:10px;padding:8px;background:#fbfcfd;min-width:0}.outreach-card-summary span{display:block;color:#718096;font-size:.67rem;font-weight:800;text-transform:uppercase}.outreach-card-summary strong{display:block;margin-top:2px;font-size:1.05rem;color:#253646}.outreach-card-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
        @media(max-width:900px){.outreach-campaign-grid{grid-template-columns:1fr}.outreach-create-grid{grid-template-columns:1fr 1fr}.outreach-create-grid .btn{grid-column:span 2}}
        @media(max-width:640px){.outreach-create-grid{grid-template-columns:1fr}.outreach-create-grid .btn{grid-column:auto;width:100%}.outreach-card-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.outreach-card-actions .btn{flex:1;min-width:130px}.outreach-page-heading>.btn{width:100%}}
      `}</style>
    </>
  )
}
