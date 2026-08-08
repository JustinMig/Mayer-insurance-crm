import type { Metadata, Viewport } from 'next'
import './globals.css'
import { ServiceWorkerRegister } from './service-worker-register'

export const metadata: Metadata = {
  title: 'Mayer Insurance Group CRM',
  description: 'Mayer Insurance Group client relationship management system',
  applicationName: 'Mayer Insurance Group CRM',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Mayer CRM'
  },
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg'
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#10263f'
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
