import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { canSeeAllClients } from '@/lib/client-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { supabase, userId, profile } = await getCrmSession()
    if (!profile?.agency_id) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

    const q = (request.nextUrl.searchParams.get('q') || '').trim().slice(0, 120)
    const requestedAgent = (request.nextUrl.searchParams.get('agent') || '').trim()
    const requestedLimit = Number(request.nextUrl.searchParams.get('limit') || '40')
    const requestedOffset = Number(request.nextUrl.searchParams.get('offset') || '0')
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, Math.trunc(requestedLimit))) : 40
    const offset = Number.isFinite(requestedOffset) ? Math.max(0, Math.trunc(requestedOffset)) : 0

    let agentId: string | null = userId
    if (canSeeAllClients(profile.role)) agentId = requestedAgent || null

    const { data, error } = await supabase.rpc('crm_client_search', {
      p_query: q,
      p_agent_id: agentId,
      p_limit: limit,
      p_offset: offset
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const rows = Array.isArray(data) ? data : []
    const total = rows.length ? Number(rows[0]?.total_count || 0) : 0

    return NextResponse.json({
      clients: rows.map((row: Record<string, unknown>) => ({
        id: row.id,
        assigned_agent_id: row.assigned_agent_id,
        first_name: row.first_name,
        last_name: row.last_name,
        phone: row.phone,
        email: row.email,
        date_of_birth: row.date_of_birth,
        is_medicare: row.is_medicare,
        is_life: row.is_life,
        is_retirement: row.is_retirement,
        created_at: row.created_at
      })),
      total,
      limit,
      offset
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to search clients.' }, { status: 500 })
  }
}
