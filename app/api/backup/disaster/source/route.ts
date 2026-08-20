import { NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 60

export async function GET() {
  const { profile } = await getCrmSession()

  if (!profile?.agency_id || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  try {
    const sourceCommit = process.env.VERCEL_GIT_COMMIT_SHA || 'main'
    const sourceUrl = `https://codeload.github.com/JustinMig/Mayer-insurance-crm/zip/${encodeURIComponent(sourceCommit)}`
    const upstream = await fetch(sourceUrl, {
      cache: 'no-store',
      headers: { 'User-Agent': 'Mayer-Insurance-CRM-Disaster-Recovery' },
    })

    if (!upstream.ok) {
      throw new Error(`GitHub source archive request failed (${upstream.status})`)
    }

    const bytes = Buffer.from(await upstream.arrayBuffer())
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': String(bytes.byteLength),
        'Content-Disposition': `attachment; filename="Mayer-insurance-crm-${sourceCommit.slice(0, 12)}.zip"`,
        'Cache-Control': 'no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    console.error('CRM disaster recovery source archive failed', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to download CRM source code archive',
    }, { status: 502 })
  }
}
