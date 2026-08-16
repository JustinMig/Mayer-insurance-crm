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
          <p>Open the secure American Amicable agent portal from this CRM tab.</p>
        </div>
      </div>

      <section className="aa-launch-card" aria-labelledby="aa-launch-title">
        <div className="aa-mark" aria-hidden="true">AA</div>
        <div className="aa-copy">
          <h2 id="aa-launch-title">American Amicable Agent Login</h2>
          <p>American Amicable blocks its secure login page from being displayed inside another website. Use the button below to open the official agent portal directly.</p>
          <p className="aa-note">Your Agent Number and Password are entered only on American Amicable&apos;s website and are not stored by the CRM.</p>
          <a className="btn btn-primary aa-open" href={AMERICAN_AMICABLE_URL} target="_blank" rel="noopener noreferrer">Open American Amicable Agent Portal</a>
        </div>
      </section>

      <style>{`
        .live-fex-page{display:grid;gap:14px;min-height:calc(100vh - 120px)}
        .quote-tool-tabs{display:flex;gap:8px;flex-wrap:wrap;padding:6px;background:#eef3f7;border:1px solid #d6e0e7;border-radius:12px;width:max-content;max-width:100%}
        .quote-tool-tabs a{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:8px 16px;border-radius:9px;color:#334155;text-decoration:none;font-weight:800;font-size:.9rem}
        .quote-tool-tabs a.active{background:#0f172a;color:#fff}
        .live-fex-header{display:flex;justify-content:space-between;align-items:end;gap:14px;flex-wrap:wrap}
        .live-fex-header span{font-size:.72rem;font-weight:900;letter-spacing:.12em;color:#2563eb}
        .live-fex-header h1{margin:3px 0 2px;font-size:1.8rem;color:#0f172a}
        .live-fex-header p{margin:0;color:#64748b}
        .aa-launch-card{display:flex;align-items:flex-start;gap:22px;background:#fff;border:1px solid #cbd5e1;border-radius:16px;padding:28px;box-shadow:0 8px 24px rgba(15,23,42,.06);max-width:820px}
        .aa-mark{display:grid;place-items:center;flex:0 0 72px;width:72px;height:72px;border-radius:18px;background:#0f172a;color:#fff;font-size:1.45rem;font-weight:900;letter-spacing:.04em}
        .aa-copy h2{margin:0 0 10px;color:#0f172a;font-size:1.35rem}
        .aa-copy p{margin:0 0 12px;color:#475569;line-height:1.55}
        .aa-copy .aa-note{font-size:.9rem;color:#64748b}
        .aa-open{display:inline-flex;margin-top:6px;text-decoration:none}
        @media(max-width:760px){.quote-tool-tabs{width:100%}.quote-tool-tabs a{flex:1;min-width:0;padding:8px 10px;font-size:.78rem}.live-fex-header h1{font-size:1.55rem}.live-fex-header p{font-size:.9rem}.aa-launch-card{padding:20px;gap:14px}.aa-mark{flex-basis:56px;width:56px;height:56px;border-radius:14px;font-size:1.05rem}.aa-copy h2{font-size:1.15rem}.aa-open{width:100%;justify-content:center;text-align:center}}
      `}</style>
    </div>
  )
}
