import type { Metadata } from 'next'
import { RootProvider } from 'fumadocs-ui/provider/next'
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
      <body className="min-h-full flex flex-col">
        {/* Theme disabled: the mode is a fixed property of the host (see `proxy.ts`), never a
            client-side toggle — `next-themes` must not add its own class or storage read. Only
            the doc pages render Fumadocs components, but the search dialog they open needs this
            context wherever it mounts, so the provider wraps both trees; it renders no visible
            markup of its own. */}
        <RootProvider theme={{ enabled: false }}>{children}</RootProvider>
      </body>
    </html>
  )
}
