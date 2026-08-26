'use client'

import AddToCampaignSelected from './AddToCampaignSelected'

export default function AddToCallListSelected({ selectedClientIds }: { selectedClientIds: string[] }) {
  return <AddToCampaignSelected selectedClientIds={selectedClientIds} />
}
