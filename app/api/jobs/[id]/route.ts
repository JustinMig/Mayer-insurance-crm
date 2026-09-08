import { NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

export async function GET(_request: Request, { params }: { params: Params }) {
  try {
    const { id } = await params
    const { userId, profile } = await getCrmSession()
    if (!profile?.agency_id) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
    const admin = createAdminClient()
    let query = admin
      .from('crm_background_jobs')
      .select('id,job_type,status,total_items,processed_items,succeeded_items,failed_items,result,error_message,created_at,started_at,completed_at,updated_at')
      .eq('id', id)
      .eq('agency_id', profile.agency_id)
    if (!['admin','manager'].includes(profile.role)) query = query.eq('created_by', userId)
    const { data, error } = await query.maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Job not found.' }, { status: 404 })
    return NextResponse.json({ job: data }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load job.' }, { status: 500 })
  }
}
