import Link from 'next/link'

const AMERICAN_AMICABLE_URL = 'https://www.americanamicable.com/v4/AgentLogin.php'

export default function AmericanAmicablePage() {
  return (
    <div className="live-fex-page">
      <div className="quote-tool-tabs" role="navigation" aria-label="Final expense quote tools">
        <Link prefetch={false} href="/fex-quotes">FEX Quotes</Link>
        <Link prefetch={false} href="/american-amicable" className="active">American Amicable</Link>
        <Link prefetch={false} href="/test-quotes">Test Quotes</Link>
      </div>

      <div className="live-fex-header">
        <div>
          <span>AGENT PORTAL</span>
          <h1>American Amicable</h1>
          <p>Sign in to the American Amicable agent portal without leaving the CRM.</p>
        </div>
      </div>

      <div className="live-fex-frame-wrap">
        <iframe
          className="live-fex-frame"
          src={AMERICAN_AMICABLE_URL}
          title="American Amicable Agent Login"
          loading="eager"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="clipboard-read; clipboard-write"
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
        .live-fex-frame-wrap{background:white;border:1px solid #cbd5e1;border-radius:14px;overflow:hidden;min-height:720px;box-shadow:0 8px 24px rgba(15,23,42,.06)}
        .live-fex-frame{display:block;width:100%;height:calc(100vh - 235px);min-height:720px;border:0;background:white}
        @media(max-width:760px){.quote-tool-tabs{width:100%}.quote-tool-tabs a{flex:1;min-width:0;padding:8px 10px;font-size:.78rem}.live-fex-header h1{font-size:1.55rem}.live-fex-header p{font-size:.9rem}.live-fex-frame-wrap{min-height:760px;border-radius:10px}.live-fex-frame{height:calc(100vh - 285px);min-height:760px}}
      `}</style>
    </div>
  )
}
