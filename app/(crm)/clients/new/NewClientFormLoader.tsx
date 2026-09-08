'use client'

import dynamic from 'next/dynamic'

const NewClientForm = dynamic(() => import('./NewClientForm'), {
  ssr: false,
  loading: () => <div className="card card-pad" style={{ marginTop: 20 }}><div className="subtle">Loading client intake form…</div></div>
})

type AgentOption = { id: string; full_name: string; role: string }

type Props = {
  currentUserId: string
  currentUserName: string
  currentUserEmail: string
  currentUserRole: string
  agents: AgentOption[]
}

export default function NewClientFormLoader(props: Props) {
  return <NewClientForm {...props} />
}
