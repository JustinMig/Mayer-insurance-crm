import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type CrmProfile = {
  agency_id: string | null
  full_name: string | null
  role: string
  active: boolean | null
}

/**
 * Request-scoped CRM session/profile lookup.
 * React.cache deduplicates this work when both a layout and page need it
 * during the same Server Component render without sharing data across users.
 */
export const getCrmSession = cache(async () => {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()

  if (!claimsData?.claims) redirect('/login')

  const userId = String(claimsData.claims.sub)
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('agency_id, full_name, role, active')
    .eq('id', userId)
    .maybeSingle()

  return {
    supabase,
    claims: claimsData.claims,
    userId,
    profile: (profile || null) as CrmProfile | null,
    profileError
  }
})
