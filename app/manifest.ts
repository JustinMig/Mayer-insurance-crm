import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'M&M CRM',
    short_name: 'M&M CRM',
    description: 'Secure coordinator and client relationship management for M&M CRM.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#d9e7ef',
    theme_color: '#d9e7ef',
    icons: [
      {
        src: '/mm-logo.jpg?v=2',
        sizes: '512x512',
        type: 'image/jpeg',
        purpose: 'any'
      }
    ]
  }
}
