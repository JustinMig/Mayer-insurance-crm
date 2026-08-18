export const dynamic = 'force-static'

export async function GET() {
  return Response.json(
    {
      name: 'Mayer Leads',
      short_name: 'Leads',
      description: 'Quick lead entry for Mayer CRM',
      start_url: '/leads',
      scope: '/',
      display: 'standalone',
      background_color: '#f7f3ea',
      theme_color: '#0b1f3a',
      icons: [
        {
          src: '/leads-icon.png',
          sizes: '180x180',
          type: 'image/png',
          purpose: 'any'
        }
      ]
    },
    {
      headers: {
        'Content-Type': 'application/manifest+json',
        'Cache-Control': 'public, max-age=3600'
      }
    }
  )
}
