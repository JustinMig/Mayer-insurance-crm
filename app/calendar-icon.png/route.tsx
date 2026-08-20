import { ImageResponse } from 'next/og'

export const runtime = 'nodejs'

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '180px',
          height: '180px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f7f3ea',
          borderRadius: '38px',
          padding: '16px'
        }}
      >
        <div
          style={{
            width: '148px',
            height: '148px',
            display: 'flex',
            flexDirection: 'column',
            background: '#fffdf8',
            border: '6px solid #15191f',
            borderRadius: '26px',
            overflow: 'hidden',
            boxShadow: '0 8px 18px rgba(15,23,42,.18)'
          }}
        >
          <div
            style={{
              height: '42px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-around',
              background: '#c99620',
              borderBottom: '5px solid #15191f',
              color: '#15191f',
              fontSize: '22px',
              fontWeight: 900
            }}
          >
            <span>●</span><span>●</span>
          </div>
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0px'
            }}
          >
            <div style={{ fontSize: '62px', lineHeight: 1 }}>🐻</div>
            <div style={{ color: '#c99620', fontSize: '28px', fontWeight: 900, marginTop: '-5px' }}>M</div>
          </div>
        </div>
      </div>
    ),
    {
      width: 180,
      height: 180,
      headers: { 'Cache-Control': 'public, max-age=31536000, immutable' }
    }
  )
}
