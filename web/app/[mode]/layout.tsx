import type { Metadata } from 'next'
import { data, display, prose } from '../fonts'
import '../globals.css'

export const metadata: Metadata = {
  title: 'Caplane',
  description: 'An encrypted lien registry writable only from inside a TEE.',
}

/** Both trees are prerendered. The proxy decides which one a host reaches. */
export const generateStaticParams = () => [{ mode: 'dark' }, { mode: 'paper' }]

export default async function RootLayout({ children, params }: LayoutProps<'/[mode]'>) {
  const { mode } = await params
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
