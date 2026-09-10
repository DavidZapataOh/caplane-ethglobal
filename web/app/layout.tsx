import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { data, display, prose } from './fonts'
import './globals.css'

export const metadata: Metadata = {
  title: 'Caplane',
  description: 'An encrypted lien registry writable only from inside a TEE.',
}

/**
 * The mode is assigned by domain, never chosen by the reader: a register is read the way a
 * document is read. One project serves both hosts, so it is resolved per request.
 */
const modeFor = (host: string | null) => (host?.startsWith('registry.') ? 'paper' : 'dark')

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const mode = modeFor((await headers()).get('host'))
  return (
    <html
      lang="en"
      data-mode={mode}
      className={`${display.variable} ${prose.variable} ${data.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  )
}
