import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const FEX_URL = 'https://fexquotes.com/wqt/v1/webrate.pl?id=5436&fn=1&vrt=m&tgt=1&cpn=0&style=blackice'

function compact(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

export async function GET() {
  const response = await fetch(FEX_URL, {
    cache: 'no-store',
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; MayerInsuranceCRM/1.0)'
    }
  })

  const html = await response.text()
  const forms = Array.from(html.matchAll(/<form\b[\s\S]*?<\/form>/gi)).map((match) => {
    const form = match[0]
    const open = form.match(/<form\b[^>]*>/i)?.[0] ?? ''
    const action = open.match(/\baction\s*=\s*["']?([^"'\s>]+)/i)?.[1] ?? null
    const method = open.match(/\bmethod\s*=\s*["']?([^"'\s>]+)/i)?.[1] ?? null
    const target = open.match(/\btarget\s*=\s*["']?([^"'\s>]+)/i)?.[1] ?? null
    const names = Array.from(form.matchAll(/<(?:input|select|button)\b[^>]*\bname\s*=\s*["']?([^"'\s>]+)/gi)).map((m) => m[1])
    const targets = Array.from(form.matchAll(/\b(?:target|formtarget)\s*=\s*["']?([^"'\s>]+)/gi)).map((m) => m[1])
    const onclick = Array.from(form.matchAll(/\bonclick\s*=\s*(["'])([\s\S]*?)\1/gi)).map((m) => compact(m[2]))
    return { open: compact(open), action, method, target, names: Array.from(new Set(names)), targets: Array.from(new Set(targets)), onclick }
  })

  const popupSnippets = Array.from(html.matchAll(/.{0,180}(?:window\.open|target\s*=\s*["']?_blank|formtarget\s*=\s*["']?_blank).{0,260}/gi))
    .slice(0, 20)
    .map((m) => compact(m[0]))

  const quoteSnippets = Array.from(html.matchAll(/.{0,220}(?:value\s*=\s*["']?Quote|>\s*Quote\s*<|quote\().{0,320}/gi))
    .slice(0, 20)
    .map((m) => compact(m[0]))

  return NextResponse.json({
    status: response.status,
    finalUrl: response.url,
    contentType: response.headers.get('content-type'),
    forms,
    popupSnippets,
    quoteSnippets
  })
}
