import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Mayer Insurance Group CRM',
    short_name: 'Mayer CRM',
    description: 'Secure client relationship management for Mayer Insurance Group.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#f5f7fb',
    theme_color: '#10263f',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any maskable'
      }
    ]
  }
}
