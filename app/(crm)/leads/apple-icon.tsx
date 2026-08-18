import { ImageResponse } from 'next/og'
import { LEADS_ICON_PNG_BASE64 } from '@/lib/leads-icon-data'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    <img
      src={`data:image/png;base64,${LEADS_ICON_PNG_BASE64}`}
      width="180"
      height="180"
      alt="Mayer Leads"
      style={{ width: '180px', height: '180px' }}
    />,
    size
  )
}
