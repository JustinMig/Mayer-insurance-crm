import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function retired() {
  return NextResponse.json(
    { error: 'Cognito file import has been retired.' },
    { status: 410, headers: { 'Cache-Control': 'private, no-store' } }
  )
}

export const GET = retired
export const POST = retired
