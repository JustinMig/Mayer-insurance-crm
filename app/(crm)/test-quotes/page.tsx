import Link from 'next/link'
import FexQuoteEngine from '../fex-quotes/FexQuoteEngine'

export default function TestQuotesPage() {
  return (
    <div>
      <div className="quote-tool-tabs" role="navigation" aria-label="Final expense quote tools">
        <Link prefetch={false} href="/fex-quotes">FEX Quotes</Link>
        <Link prefetch={false} href="/test-quotes" className="active">Test Quotes</Link>
      </div>
      <FexQuoteEngine />
      <style>{`
        .quote-tool-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 16px;padding:6px;background:#eef3f7;border:1px solid #d6e0e7;border-radius:12px;width:max-content;max-width:100%}
        .quote-tool-tabs a{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:8px 16px;border-radius:9px;color:#334155;text-decoration:none;font-weight:800;font-size:.9rem}
        .quote-tool-tabs a.active{background:#0f172a;color:#fff}
        .fq-head h1{font-size:0!important}
        .fq-head h1::after{content:'Test Quotes';font-size:2rem;line-height:1.15}
        @media(max-width:640px){.quote-tool-tabs{width:100%}.quote-tool-tabs a{flex:1}.fq-head h1::after{font-size:1.65rem}}
      `}</style>
    </div>
  )
}
