import { LEADS_ICON_PNG_BASE64 } from '@/lib/leads-icon-data'

export const dynamic = 'force-static'

export async function GET() {
  const bytes = Buffer.from(LEADS_ICON_PNG_BASE64, 'base64')
  return new Response(bytes, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable'
    }
  })
}
