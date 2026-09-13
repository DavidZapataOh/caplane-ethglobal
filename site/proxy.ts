import { NextResponse, type NextRequest } from 'next/server'

// `/.well-known` must stay out: the certificate validation challenge travels through it, and
// swallowing it means the domain resolves and never gets a certificate.
//
// So must the metadata routes and anything served as a file. They are emitted at the root of `app/`
// or sit in `public/`, outside `[mode]`, so each exists at exactly one path — prepending a mode to
// `/icon.png` asks for `/dark/icon.png`, which no route serves, and the favicon, the shared-link
// card and the architecture diagram 404 on a site whose pages all answer 200.
//
// The last alternative is the general case rather than a third name added after a third outage:
// middleware runs before `public/` is served, and a page route in this app never carries a file
// extension, so anything ending in one is a file and not a page.
export const config = {
  matcher: ['/((?!_next|\\.well-known|opengraph-image|.+\\.[A-Za-z0-9]+$).*)'],
}

/**
 * The mode is a property of the host, so it is resolved here and rewritten into the path.
 * Reading the host inside the layout instead would work and would opt every route out of
 * prerendering, because headers() is request-time API.
 */
export function proxy(request: NextRequest) {
  const host = request.headers.get('host') ?? ''
  // Anything off a known host — preview URLs, *.vercel.app, the apex before DNS catches up —
  // falls back to dark rather than rendering with no palette at all.
  const mode = host.startsWith('docs.') ? 'paper' : 'dark'
  const url = request.nextUrl.clone()
  url.pathname = `/${mode}${url.pathname}`
  return NextResponse.rewrite(url)
}
