import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
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
          borderRadius: 40,
          boxShadow: 'inset 0 0 0 4px rgba(15,42,79,0.05)'
        }}
      >
        <div style={{ position: 'absolute', left: 20, bottom: -9, width: 120, height: 127, borderRadius: '48% 52% 36% 36% / 45% 45% 30% 30%', background: '#111214', display: 'flex' }} />
        <div style={{ position: 'absolute', right: 27, top: 42, width: 81, height: 77, borderRadius: '48% 44% 48% 52%', background: '#111214', transform: 'rotate(-5deg)', display: 'flex' }} />
        <div style={{ position: 'absolute', right: 17, top: 79, width: 53, height: 30, borderRadius: '44% 60% 60% 48%', background: '#111214', transform: 'rotate(4deg)', display: 'flex' }} />
        <div style={{ position: 'absolute', right: 15, top: 87, width: 13, height: 12, borderRadius: '50%', background: '#050506', display: 'flex' }} />
        <div style={{ position: 'absolute', right: 86, top: 30, width: 29, height: 29, borderRadius: '50%', background: '#111214', display: 'flex' }} />
        <div style={{ position: 'absolute', right: 42, top: 31, width: 23, height: 23, borderRadius: '50%', background: '#111214', display: 'flex' }} />
        <div style={{ position: 'absolute', right: 53, top: 65, width: 15, height: 6, borderRadius: 8, background: '#f8f4ec', transform: 'rotate(-8deg)', display: 'flex' }} />
        <div
          style={{
            position: 'absolute',
            left: 27,
            top: 39,
            fontSize: 123,
            lineHeight: 0.9,
            fontFamily: 'Georgia, Times New Roman, serif',
            fontWeight: 700,
            color: '#102a4f',
            WebkitTextStroke: '4px #f8f4ec',
            textShadow: '0 2px 6px rgba(0,0,0,0.16)',
            display: 'flex'
          }}
        >
          L
        </div>
      </div>
    ),
    size
  )
}
