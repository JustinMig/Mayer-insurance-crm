const FEX_URL = 'https://fexquotes.com/wqt/v1/webrate.pl?id=5436&fn=1&vrt=m&tgt=1&cpn=0&style=blackice'

export const dynamic = 'force-dynamic'

function rewriteFexHtml(html: string) {
  let output = html

  // FEX deliberately renders the quote form with target="_blank". Because the
  // form has no action attribute, a proxied copy would otherwise POST back to
  // this CRM route. Point it explicitly at FEX and keep the response in-frame.
  output = output.replace(/<form\b([^>]*)>/gi, (_match, attrs: string) => {
    const cleanAttrs = attrs
      .replace(/\s+target\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/\s+action\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    return `<form${cleanAttrs} action="${FEX_URL.replace(/&/g, '&amp;')}" target="_self">`
  })

  // Keep relative FEX assets resolving against the original service.
  const base = '<base href="https://fexquotes.com/wqt/v1/" target="_self">'
  if (/<head\b[^>]*>/i.test(output)) {
    output = output.replace(/<head\b[^>]*>/i, (head) => `${head}${base}`)
  } else {
    output = `${base}${output}`
  }

  // Catch any other explicit new-window targets in the initial FEX markup.
  output = output
    .replace(/target\s*=\s*(["'])_blank\1/gi, 'target="_self"')
    .replace(/formtarget\s*=\s*(["'])_blank\1/gi, 'formtarget="_self"')

  return output
}

const frameHeaders = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex, nofollow',
  'content-security-policy': "frame-ancestors 'self'",
  'x-frame-options': 'SAMEORIGIN'
}

export async function GET() {
  try {
    const response = await fetch(FEX_URL, {
      cache: 'no-store',
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; MayerInsuranceCRM/1.0)',
        accept: 'text/html,application/xhtml+xml'
      }
    })

    if (!response.ok) {
      return new Response('FEX Quotes is temporarily unavailable. Please reload this page.', {
        status: 502,
        headers: frameHeaders
      })
    }

    const html = rewriteFexHtml(await response.text())
    return new Response(html, {
      status: 200,
      headers: frameHeaders
    })
  } catch {
    return new Response('FEX Quotes is temporarily unavailable. Please reload this page.', {
      status: 502,
      headers: frameHeaders
    })
  }
}
