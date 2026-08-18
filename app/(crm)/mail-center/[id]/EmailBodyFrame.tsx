'use client'

import { useEffect, useRef } from 'react'

export default function EmailBodyFrame({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement | null>(null)

  useEffect(() => {
    const frame = ref.current
    if (!frame) return
    const resize = () => {
      try {
        const doc = frame.contentDocument
        if (!doc) return
        const height = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight || 0, 420)
        frame.style.height = `${Math.min(height + 24, 5000)}px`
      } catch {}
    }
    frame.addEventListener('load', resize)
    const timer = window.setTimeout(resize, 250)
    return () => {
      frame.removeEventListener('load', resize)
      window.clearTimeout(timer)
    }
  }, [html])

  const srcDoc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank"><style>html,body{margin:0;padding:0;background:#fff;color:#111827;font-family:Arial,Helvetica,sans-serif;overflow-wrap:anywhere}body{padding:18px}img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap}a{color:#2563eb}</style></head><body>${html}</body></html>`

  return (
    <iframe
      ref={ref}
      title="Email message body"
      srcDoc={srcDoc}
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      style={{ width: '100%', minHeight: 420, border: 0, background: '#fff', display: 'block' }}
    />
  )
}
