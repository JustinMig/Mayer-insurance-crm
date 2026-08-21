import type { ReactNode } from 'react'

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
