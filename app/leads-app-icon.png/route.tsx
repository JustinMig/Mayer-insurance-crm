import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
          background: '#f8f4ec',
          borderRadius: 112,
          boxShadow: 'inset 0 0 0 12px rgba(15,42,79,0.05)'
        }}
      >
        {/* Bear silhouette */}
        <div
          style={{
            position: 'absolute',
            left: 58,
            bottom: -24,
            width: 340,
            height: 360,
            borderRadius: '48% 52% 36% 36% / 45% 45% 30% 30%',
            background: '#111214',
            display: 'flex'
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: 76,
            top: 120,
            width: 230,
            height: 220,
            borderRadius: '48% 44% 48% 52%',
            background: '#111214',
            transform: 'rotate(-5deg)',
            display: 'flex'
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: 48,
            top: 225,
            width: 150,
            height: 84,
            borderRadius: '44% 60% 60% 48%',
            background: '#111214',
            transform: 'rotate(4deg)',
            display: 'flex'
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: 42,
            top: 247,
            width: 38,
            height: 34,
            borderRadius: '50%',
            background: '#050506',
            display: 'flex'
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: 244,
            top: 84,
            width: 82,
            height: 82,
            borderRadius: '50%',
            background: '#111214',
            display: 'flex'
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: 118,
            top: 89,
            width: 66,
            height: 66,
            borderRadius: '50%',
            background: '#111214',
            display: 'flex'
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: 151,
            top: 184,
            width: 42,
            height: 16,
            borderRadius: 20,
            background: '#f8f4ec',
            transform: 'rotate(-8deg)',
            display: 'flex'
          }}
        />

        {/* Large L in front, matching the approved concept */}
        <div
          style={{
            position: 'absolute',
            left: 78,
            top: 112,
            fontSize: 350,
            lineHeight: 0.9,
            fontFamily: 'Georgia, Times New Roman, serif',
            fontWeight: 700,
            color: '#102a4f',
            WebkitTextStroke: '10px #f8f4ec',
            textShadow: '0 5px 18px rgba(0,0,0,0.16)',
            display: 'flex'
          }}
        >
          L
        </div>
      </div>
    ),
    {
      width: 512,
      height: 512,
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    }
  )
}
