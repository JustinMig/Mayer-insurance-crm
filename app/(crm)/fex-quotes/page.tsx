import Link from 'next/link'

const FEX_QUOTES_URL = 'https://fexquotes.com/wqt/v1/webrate.pl?id=5436&fn=1&vrt=m&tgt=2&cpn=0&style=blackice'

export default function FexQuotesPage() {
  return (
    <div className="live-fex-page">
      <div className="quote-tool-tabs" role="navigation" aria-label="Final expense quote tools">
        <Link prefetch={false} href="/fex-quotes" className="active">FEX Quotes</Link>
        <Link prefetch={false} href="/test-quotes">Test Quotes</Link>
      </div>

      <div className="live-fex-header">
        <div>
          <span>LIVE QUOTER</span>
          <h1>FEX Quotes</h1>
          <p>Use the FEXQuotes.com final expense quoting tool without leaving the CRM.</p>
        </div>
        <a href={FEX_QUOTES_URL} target="_blank" rel="noopener noreferrer">Open in new tab ↗</a>
      </div>

      <div className="live-fex-frame-wrap">
        <iframe
          className="live-fex-frame"
          src={FEX_QUOTES_URL}
          title="FEX Quotes final expense quoter"
          loading="eager"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>

      <style>{`
        .live-fex-page{display:grid;gap:14px;min-height:calc(100vh - 120px)}
        .quote-tool-tabs{display:flex;gap:8px;flex-wrap:wrap;padding:6px;background:#eef3f7;border:1px solid #d6e0e7;border-radius:12px;width:max-content;max-width:100%}
        .quote-tool-tabs a{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:8px 16px;border-radius:9px;color:#334155;text-decoration:none;font-weight:800;font-size:.9rem}
        .quote-tool-tabs a.active{background:#0f172a;color:#fff}
        .live-fex-header{display:flex;justify-content:space-between;align-items:end;gap:14px;flex-wrap:wrap}
        .live-fex-header span{font-size:.72rem;font-weight:900;letter-spacing:.12em;color:#2563eb}
        .live-fex-header h1{margin:3px 0 2px;font-size:1.8rem;color:#0f172a}
        .live-fex-header p{margin:0;color:#64748b}
        .live-fex-header>a{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:9px 13px;border:1px solid #cbd5e1;border-radius:10px;text-decoration:none;color:#0f172a;font-weight:800;background:white}
        .live-fex-frame-wrap{background:white;border:1px solid #cbd5e1;border-radius:14px;overflow:hidden;min-height:720px;box-shadow:0 8px 24px rgba(15,23,42,.06)}
        .live-fex-frame{display:block;width:100%;height:calc(100vh - 235px);min-height:720px;border:0;background:white}
        @media(max-width:760px){.quote-tool-tabs{width:100%}.quote-tool-tabs a{flex:1}.live-fex-header h1{font-size:1.55rem}.live-fex-header p{font-size:.9rem}.live-fex-header>a{width:100%}.live-fex-frame-wrap{min-height:760px;border-radius:10px}.live-fex-frame{height:calc(100vh - 285px);min-height:760px}}
      `}</style>
    </div>
  )
}
