export const dynamic = 'force-static'

export async function GET() {
  const manifest = {
    name: 'Mayer Calendar',
    short_name: 'Calendar',
    description: 'Mayer CRM appointments and activities calendar',
    start_url: '/calendar',
    scope: '/',
    display: 'standalone',
    background_color: '#f7f3ea',
    theme_color: '#c99620',
    icons: [
      {
        src: '/calendar-icon-v2.png',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any'
      }
    ]
  }

  return new Response(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=3600'
    }
  })
}
