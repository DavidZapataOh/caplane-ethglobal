import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/** Generated at build time: dark ground, hairline rule, no image file to keep in sync. */
export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#0D0C0B',
        color: '#E6E3DF',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: 96,
        fontFamily: 'monospace',
      }}
    >
      <div style={{ fontSize: 84, letterSpacing: '-0.03em' }}>Caplane</div>
      <div style={{ height: 1, background: '#39352F', margin: '40px 0' }} />
      <div style={{ fontSize: 38, color: '#A39C93', lineHeight: 1.35 }}>
        An encrypted lien registry writable only from inside a TEE.
      </div>
    </div>,
    size,
  )
}
