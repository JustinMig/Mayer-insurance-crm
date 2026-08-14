import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function retired() {
  return NextResponse.json(
    { error: 'This importer has been retired. Use /clients/document-import.' },
    { status: 410, headers: { 'Cache-Control': 'private, no-store' } }
  )
}

export const GET = retired
export const POST = retired
export const PUT = retired
export const PATCH = retired
export const DELETE = retired
