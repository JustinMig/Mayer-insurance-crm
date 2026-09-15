import type { Metadata, Viewport } from 'next'
import './public-base.css'
import { ServiceWorkerRegister } from './service-worker-register'

export const metadata: Metadata = {
  title: 'M&M CRM',
  description: 'M&M CRM coordinator and client relationship management system',
  applicationName: 'M&M CRM',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'M&M CRM'
  },
  icons: {
    icon: [
      { url: '/mm-logo.jpg', sizes: '512x512', type: 'image/jpeg' }
    ],
    apple: [{ url: '/mm-logo.jpg', sizes: '512x512', type: 'image/jpeg' }],
    shortcut: [{ url: '/mm-logo.jpg', sizes: '512x512', type: 'image/jpeg' }]
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#d9e7ef'
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  )
}
