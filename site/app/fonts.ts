import { IBM_Plex_Mono, IBM_Plex_Sans, Martian_Mono } from 'next/font/google'

// The loader has to run from a file the app compiles and the URLs it emits are hashed per
// app, so this cannot live in the brand package. The package consumes the variables instead.
//
// latin only: Spanish and English both fit inside U+0000-00FF, and latin-ext adds weight for
// glyphs neither surface can render.

export const display = Martian_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  display: 'swap',
  variable: '--cp-font-display',
})

export const prose = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--cp-font-prose',
})

export const data = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--cp-font-data',
})
