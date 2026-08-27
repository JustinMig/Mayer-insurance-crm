'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Agent = { id: string; full_name: string }
type CampaignSummary = {
  id: string
  name: string
  topic: string
  assigned_agent_id: string
  agent_name: string
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
  return 'General Review'
}

function shortDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

export default function CampaignsClient({ campaigns, agents, canChooseAgent, defaultAgentId }: {
  campaigns: CampaignSummary[]
  agents: Agent[]
  canChooseAgent: boolean
  defaultAgentId: string
}) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [topic, setTopic] = useState('general')
  const [assignedAgentId, setAssignedAgentId] = useState(defaultAgentId)
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [message, setMessage] = useState('')

  const totals = campaigns.reduce((summary, campaign) => {
    summary.notContacted += campaign.not_contacted
    summary.followUp += campaign.follow_up
    summary.resolved += campaign.completed + campaign.not_interested + campaign.do_not_call + campaign.unreachable
    return summary
  }, { notContacted: 0, followUp: 0, resolved: 0 })

  async function createCampaign() {
    if (creating) return
    if (name.trim().length < 2) return setMessage('Enter a campaign name.')
    if (canChooseAgent && !assignedAgentId) return setMessage('Choose which agent owns this campaign.')
    setCreating(true)
    setMessage('')
    try {
      const response = await fetch('/api/outreach-campaigns/agent-scoped', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', name: name.trim(), topic, assigned_agent_id: assignedAgentId })
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to create campaign.')
      setName('')
      setMessage(`Campaign created${data.campaign?.agent_name ? ` for ${data.campaign.agent_name}` : ''}. Add clients from Client Records.`)
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

  async function renameCampaign(id: string, currentName: string) {
    if (busyId) return
    const nextName = window.prompt('Rename campaign:', currentName)?.trim() || ''
    if (!nextName || nextName === currentName) return
    if (nextName.length < 2) return setMessage('Campaign name must be at least 2 characters.')

    setBusyId(id)
    setMessage('')
    try {
      const response = await fetch('/api/outreach-campaigns/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rename', campaign_id: id, name: nextName })
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to rename campaign.')
      setMessage(`Campaign renamed to “${nextName}”.`)
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to rename campaign.')
    } finally {
      setBusyId('')
    }
  }

  async function deleteCampaign(campaign: CampaignSummary) {
    if (busyId) return
    const confirmed = window.confirm(
      `Permanently delete “${campaign.name}”?\n\n` +
      `This removes this campaign, its ${campaign.total} campaign client entr${campaign.total === 1 ? 'y' : 'ies'}, and the outreach history recorded inside this campaign.\n\n` +
      'Client records themselves will NOT be deleted. This cannot be undone.'
    )
    if (!confirmed) return

    setBusyId(campaign.id)
    setMessage('')
    try {
      const response = await fetch('/api/outreach-campaigns/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', campaign_id: campaign.id })
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to delete campaign.')
      setMessage(`“${campaign.name}” was permanently deleted. Client records were kept.`)
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to delete campaign.')
    } finally {
      setBusyId('')
    }
  }

  return (
    <div className="outreach-shell">
      <header className="outreach-header">
        <div className="outreach-heading-row">
          <div>
            <span className="outreach-eyebrow">CLIENT ENGAGEMENT</span>
            <h1>Outreach</h1>
            <p>{canChooseAgent ? 'Oversee each agent’s campaigns, follow-ups, and completed outreach.' : 'Track your active client contact, follow-ups, and completed outreach in one place.'}</p>
          </div>
          <Link prefetch={false} className="btn btn-secondary outreach-add-clients" href="/clients">ADD CLIENTS</Link>
        </div>

        <div className="outreach-kpi-strip" aria-label="Outreach summary">
          <div><span>Active campaigns</span><strong>{campaigns.length}</strong></div>
          <div><span>Need contact</span><strong>{totals.notContacted}</strong></div>
          <div><span>Follow-ups</span><strong>{totals.followUp}</strong></div>
          <div><span>Resolved</span><strong>{totals.resolved}</strong></div>
        </div>
      </header>

      <section className={`outreach-create-bar${canChooseAgent ? ' has-agent' : ''}`} aria-label="Create outreach campaign">
        <div className="outreach-create-label">
          <strong>New campaign</strong>
          <span>Set the purpose, then add clients.</span>
        </div>
        <label className="outreach-compact-field">
          <span>Campaign name</span>
          <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="2026 Medicare Client Review" />
        </label>
        <label className="outreach-compact-field outreach-topic-field">
          <span>Topic</span>
          <select className="select" value={topic} onChange={(event) => setTopic(event.target.value)}>
            <option value="medicare">Medicare</option>
            <option value="life">Life</option>
            <option value="health">Health</option>
            <option value="retirement">Retirement</option>
            <option value="general">General client review</option>
            <option value="other">Other</option>
          </select>
        </label>
        {canChooseAgent ? (
          <label className="outreach-compact-field outreach-agent-field">
            <span>Agent</span>
            <select className="select" value={assignedAgentId} onChange={(event) => setAssignedAgentId(event.target.value)}>
              {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.full_name}</option>)}
            </select>
          </label>
        ) : null}
        <button className="btn btn-primary outreach-create-button" type="button" disabled={creating} onClick={() => void createCampaign()}>{creating ? 'Creating…' : 'CREATE'}</button>
      </section>

      {message ? <div className="notice outreach-notice">{message}</div> : null}

      <section className="outreach-list-panel">
        <div className="outreach-list-heading">
          <div><h2>Active campaigns</h2><span>{campaigns.length} current</span></div>
          <span className="outreach-list-hint">Open a campaign to work its client queue.</span>
        </div>

        {!campaigns.length ? (
          <div className="outreach-empty">
            <strong>No active campaigns</strong>
            <span>Create a campaign above, then add clients from Client Records.</span>
          </div>
        ) : (
          <div className="outreach-campaign-list">
            {campaigns.map((campaign) => {
              const closed = campaign.completed + campaign.not_interested + campaign.do_not_call + campaign.unreachable
              const reachedActive = campaign.spoke + campaign.follow_up
              const contacted = reachedActive + closed
              const progress = campaign.total ? Math.round((closed / campaign.total) * 100) : 0
              const isBusy = busyId === campaign.id

              return (
                <article className="outreach-campaign-row" key={campaign.id}>
                  <div className="outreach-campaign-identity">
                    <span className={`outreach-topic-dot outreach-topic-${campaign.topic}`} aria-hidden="true" />
                    <div className="outreach-campaign-copy">
                      <div className="outreach-name-line">
                        <h3>{campaign.name}</h3>
                        <span className="outreach-topic-label">{topicLabel(campaign.topic)}</span>
                      </div>
                      <div className="outreach-meta-line">
                        <span className="outreach-agent-meta">{campaign.agent_name}</span>
                        <span>{campaign.total} client{campaign.total === 1 ? '' : 's'}</span>
                        <span>{campaign.not_contacted} not contacted</span>
                        <span>{campaign.follow_up} follow-up</span>
                        {campaign.created_at ? <span>Started {shortDate(campaign.created_at)}</span> : null}
                      </div>
                    </div>
                  </div>

                  <div className="outreach-row-progress">
                    <div className="outreach-progress-label"><span>Resolved</span><strong>{progress}%</strong></div>
                    <div className="outreach-progress-track"><span style={{ width: `${progress}%` }} /></div>
                    <small>{closed} of {campaign.total} complete</small>
                  </div>

                  <div className="outreach-row-stats">
                    <span><strong>{campaign.attempted}</strong> Attempted</span>
                    <span><strong>{reachedActive}</strong> Active</span>
                    <span><strong>{contacted}</strong> Contacted</span>
                  </div>

                  <div className="outreach-row-actions">
                    <Link prefetch={false} className="btn btn-primary outreach-open-button" href={`/campaigns/${campaign.id}`}>OPEN</Link>
                    {campaign.can_archive ? <button className="outreach-text-action" type="button" disabled={isBusy} onClick={() => void renameCampaign(campaign.id, campaign.name)}>{isBusy ? 'Working…' : 'Rename'}</button> : null}
                    {campaign.can_archive ? <button className="outreach-text-action" type="button" disabled={isBusy} onClick={() => void archiveCampaign(campaign.id, campaign.name)}>{isBusy ? 'Working…' : 'Archive'}</button> : null}
                    {campaign.can_archive ? <button className="outreach-text-action outreach-delete-action" type="button" disabled={isBusy} onClick={() => void deleteCampaign(campaign)}>{isBusy ? 'Working…' : 'Delete'}</button> : null}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <style jsx global>{`
        .outreach-shell{max-width:1280px;margin:0 auto;color:#1f2937}
        .outreach-header{margin-bottom:14px}.outreach-heading-row{display:flex;justify-content:space-between;align-items:flex-end;gap:18px}.outreach-eyebrow{display:block;margin-bottom:5px;color:#718096;font-size:.66rem;font-weight:900;letter-spacing:.12em}.outreach-heading-row h1{margin:0;font-size:1.9rem;line-height:1.08;letter-spacing:-.025em;color:#172033}.outreach-heading-row p{margin:6px 0 0;color:#667788;font-size:.88rem}.outreach-add-clients{white-space:nowrap}
        .outreach-kpi-strip{display:flex;align-items:center;margin-top:16px;padding:10px 0;border-top:1px solid #e1e7ec;border-bottom:1px solid #e1e7ec}.outreach-kpi-strip>div{display:flex;align-items:baseline;gap:8px;min-width:0;padding:0 20px;border-right:1px solid #e5e9ed}.outreach-kpi-strip>div:first-child{padding-left:0}.outreach-kpi-strip>div:last-child{border-right:0}.outreach-kpi-strip span{font-size:.69rem;font-weight:800;text-transform:uppercase;letter-spacing:.035em;color:#7a8794;white-space:nowrap}.outreach-kpi-strip strong{font-size:1.12rem;color:#263746}
        .outreach-create-bar{display:grid;grid-template-columns:minmax(150px,.8fr) minmax(280px,1.7fr) minmax(170px,.8fr) auto;gap:11px;align-items:end;margin:17px 0 14px;padding:13px 14px;border:1px solid #dce3e8;border-radius:10px;background:#f9fbfc}.outreach-create-bar.has-agent{grid-template-columns:minmax(140px,.7fr) minmax(240px,1.45fr) minmax(150px,.7fr) minmax(160px,.72fr) auto}.outreach-create-label{align-self:center}.outreach-create-label strong{display:block;font-size:.86rem;color:#263746}.outreach-create-label span{display:block;margin-top:2px;color:#7a8794;font-size:.72rem}.outreach-compact-field{display:grid;gap:5px}.outreach-compact-field>span{color:#6f7d8a;font-size:.67rem;font-weight:800;text-transform:uppercase;letter-spacing:.035em}.outreach-compact-field .input,.outreach-compact-field .select{min-height:39px;background:#fff}.outreach-create-button{min-height:39px;padding-inline:18px}.outreach-notice{margin:0 0 14px}
        .outreach-list-panel{border:1px solid #dce3e8;border-radius:11px;background:#fff;overflow:hidden}.outreach-list-heading{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:13px 16px;border-bottom:1px solid #e5eaee;background:#fbfcfd}.outreach-list-heading>div{display:flex;align-items:baseline;gap:8px}.outreach-list-heading h2{margin:0;font-size:.98rem;color:#263746}.outreach-list-heading>div>span,.outreach-list-hint{color:#7b8894;font-size:.72rem}.outreach-empty{display:grid;gap:4px;padding:30px 18px;text-align:center}.outreach-empty strong{color:#344556}.outreach-empty span{color:#7b8894;font-size:.83rem}
        .outreach-campaign-list{display:grid}.outreach-campaign-row{display:grid;grid-template-columns:minmax(300px,2.1fr) minmax(165px,.9fr) minmax(250px,1.25fr) auto;align-items:center;gap:18px;padding:14px 16px;border-bottom:1px solid #edf0f2;transition:background .15s ease}.outreach-campaign-row:last-child{border-bottom:0}.outreach-campaign-row:hover{background:#fbfcfd}.outreach-campaign-identity{display:flex;align-items:flex-start;gap:11px;min-width:0}.outreach-topic-dot{width:9px;height:9px;border-radius:50%;margin-top:7px;flex:0 0 auto;background:#8997a4}.outreach-topic-medicare{background:#9b875a}.outreach-topic-life{background:#668474}.outreach-topic-health{background:#6d839a}.outreach-topic-retirement{background:#847591}.outreach-topic-other{background:#8a7c72}.outreach-campaign-copy{min-width:0}.outreach-name-line{display:flex;align-items:center;gap:8px;min-width:0}.outreach-name-line h3{margin:0;min-width:0;color:#1f2f3d;font-size:.94rem;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.outreach-topic-label{display:inline-flex;align-items:center;min-height:21px;padding:2px 7px;border:1px solid #dde4e9;border-radius:999px;background:#f8fafb;color:#6e7c88;font-size:.61rem;font-weight:900;text-transform:uppercase;letter-spacing:.035em;white-space:nowrap}.outreach-meta-line{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:5px;color:#7b8792;font-size:.7rem}.outreach-meta-line span+span:before{content:'•';margin-right:12px;color:#c0c8cf}.outreach-agent-meta{font-weight:900;color:#536d80}
        .outreach-row-progress{min-width:0}.outreach-progress-label{display:flex;justify-content:space-between;gap:8px;align-items:baseline}.outreach-progress-label span{font-size:.65rem;font-weight:800;text-transform:uppercase;color:#798692}.outreach-progress-label strong{font-size:.84rem;color:#435866}.outreach-progress-track{height:5px;border-radius:999px;background:#e7ecef;overflow:hidden;margin:6px 0}.outreach-progress-track span{display:block;height:100%;border-radius:inherit;background:#809b94}.outreach-row-progress small{display:block;color:#8a959e;font-size:.65rem}
        .outreach-row-stats{display:flex;align-items:center;gap:14px;min-width:0}.outreach-row-stats span{display:flex;align-items:baseline;gap:4px;color:#7b8792;font-size:.66rem;white-space:nowrap}.outreach-row-stats strong{font-size:.82rem;color:#3b4d5d}.outreach-row-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;white-space:nowrap}.outreach-open-button{min-height:34px;padding:6px 12px;font-size:.72rem}.outreach-text-action{border:0;background:transparent;padding:5px 2px;color:#667786;font:inherit;font-size:.69rem;font-weight:800;cursor:pointer}.outreach-text-action:hover{color:#263746;text-decoration:underline}.outreach-text-action:disabled{opacity:.5;cursor:default}.outreach-delete-action{color:#965d5d}.outreach-delete-action:hover{color:#7f4242}
        @media(max-width:1100px){.outreach-campaign-row{grid-template-columns:minmax(280px,1.8fr) minmax(150px,.8fr) auto}.outreach-row-stats{display:none}.outreach-create-bar.has-agent{grid-template-columns:1fr 1.2fr 1fr}}
        @media(max-width:850px){.outreach-create-bar,.outreach-create-bar.has-agent{grid-template-columns:1fr 1.2fr}.outreach-create-label{grid-column:1/-1}.outreach-create-button{width:100%}.outreach-campaign-row{grid-template-columns:minmax(0,1fr) 150px;gap:12px}.outreach-row-actions{grid-column:1/-1;justify-content:flex-start;padding-left:20px}.outreach-list-hint{display:none}}
        @media(max-width:640px){.outreach-heading-row{align-items:flex-start}.outreach-heading-row h1{font-size:1.65rem}.outreach-add-clients{min-height:36px;padding:7px 10px;font-size:.72rem}.outreach-kpi-strip{display:grid;grid-template-columns:1fr 1fr;gap:0;padding:0}.outreach-kpi-strip>div{justify-content:space-between;padding:9px 10px!important;border-right:0;border-bottom:1px solid #e5e9ed}.outreach-kpi-strip>div:nth-child(odd){border-right:1px solid #e5e9ed}.outreach-kpi-strip>div:nth-last-child(-n+2){border-bottom:0}.outreach-kpi-strip span{white-space:normal}.outreach-create-bar,.outreach-create-bar.has-agent{grid-template-columns:1fr;padding:12px}.outreach-create-label{grid-column:auto}.outreach-campaign-row{grid-template-columns:1fr;padding:13px}.outreach-row-progress{padding-left:20px}.outreach-row-actions{grid-column:auto;padding-left:20px;gap:10px;flex-wrap:wrap}.outreach-name-line{align-items:flex-start;flex-direction:column;gap:4px}.outreach-name-line h3{white-space:normal}.outreach-meta-line{gap:4px 9px}.outreach-meta-line span+span:before{margin-right:9px}.outreach-list-heading{padding:11px 13px}.outreach-open-button{min-width:76px}.outreach-text-action{padding:6px 1px}}
      `}</style>
    </div>
  )
}
