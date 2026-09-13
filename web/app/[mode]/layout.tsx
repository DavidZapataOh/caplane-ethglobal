import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import mark from '../../public/caplane-mark.png'
import { data, display, prose } from '../fonts'
import '../globals.css'

export const metadata: Metadata = {
  title: 'Caplane',
  description: 'An encrypted lien registry writable only from inside a TEE.',
}

/** Both trees are prerendered. The proxy decides which one a host reaches. */
export const generateStaticParams = () => [{ mode: 'dark' }, { mode: 'paper' }]

const NAV = [
  ['Registry', '/registry'],
  ['Pledge', '/submit'],
  ['Claims', '/claims'],
  ['Invest', '/invest'],
  ['Harness', '/harness'],
] as const

/**
 * The shell every app surface sits in.
 *
 * Each page used to be a bare `<main>` with a heading and a paragraph, which is why they read as
 * unstyled markup rather than as one product: no masthead, no measure, nothing holding the page
 * together. The structure lives here so all six surfaces get it at once and none of them can drift.
 */
export default async function RootLayout({ children, params }: LayoutProps<'/[mode]'>) {
  const { mode } = await params
  return (
    <html
      lang="en"
      data-mode={mode}
      className={`${display.variable} ${prose.variable} ${data.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-ground">
        <header className="sticky top-0 z-10 border-b border-border bg-ground/95 backdrop-blur">
          <nav className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-6 py-4">
            <Link
              href="/"
              className="flex shrink-0 items-center gap-2.5 font-display text-lg font-medium tracking-[-0.03em] text-text focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-text"
            >
              <Image src={mark} alt="" width={26} height={26} priority className="shrink-0" />
              Caplane
            </Link>
            <ul className="hidden items-center gap-7 font-prose text-sm text-text-2 md:flex">
              {NAV.map(([label, href]) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="hover:text-text focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-text"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
            <a
              href="https://caplane.xyz"
              className="shrink-0 border border-border-strong px-3.5 py-2 font-display text-sm text-text hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
            >
              What is this?
            </a>
          </nav>
        </header>

        <div className="mx-auto w-full max-w-5xl flex-1 px-6">{children}</div>

        <footer className="mt-24 border-t border-border">
          <div className="mx-auto flex max-w-5xl flex-col gap-2 px-6 py-8 font-prose text-sm text-text-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-prose">
              The registry accepts a write from the network&apos;s forwarder and from no one else,
              including us.
            </p>
            <a
              href="https://github.com/DavidZapataOh/caplane-ethglobal"
              className="shrink-0 hover:text-text-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-text"
            >
              Source
            </a>
          </div>
        </footer>
      </body>
    </html>
  )
}
