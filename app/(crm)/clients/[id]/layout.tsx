import type { ReactNode } from 'react'
import '../../../client-record-visual.css'

export default function ClientRecordLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <style>{`
        .client-profile-form .section-details.section-care[open] {
          overflow: visible;
        }
      `}</style>
    </>
  )
}
