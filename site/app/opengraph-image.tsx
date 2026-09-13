import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/**
 * Generated at build time: dark ground, hairline rule, the mark on its own transparent ground so it
 * sits on this card's colour rather than carrying a second one.
 *
 * Read from disk and inlined rather than referenced by URL. The card is rendered where no server is
 * listening yet, so a relative `src` resolves to nothing and the mark silently does not appear.
 */
const mark = `data:image/png;base64,${readFileSync(join(process.cwd(), 'app', 'mark.png')).toString('base64')}`

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <img src={mark} width={140} height={140} alt="" />
        <div style={{ fontSize: 84, letterSpacing: '-0.03em' }}>Caplane</div>
      </div>
      <div style={{ height: 1, background: '#39352F', margin: '40px 0' }} />
      <div style={{ fontSize: 38, color: '#A39C93', lineHeight: 1.35 }}>
        An encrypted lien registry writable only from inside a TEE.
      </div>
    </div>,
    size,
  )
}
