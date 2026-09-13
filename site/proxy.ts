import { NextResponse, type NextRequest } from 'next/server'

// `/.well-known` must stay out: the certificate validation challenge travels through it, and
// swallowing it means the domain resolves and never gets a certificate.
//
// So must the metadata routes. They are emitted at the root of `app/`, outside `[mode]`, so each
// exists at exactly one path — prepending a mode to `/icon.png` asks for `/dark/icon.png`, which no
// route serves, and the favicon and the shared-link card 404 on a site whose pages all answer 200.
export const config = {
  matcher: ['/((?!_next|\\.well-known|icon\\.png|apple-icon\\.png|favicon\\.ico|opengraph-image|robots\\.txt|sitemap\\.xml).*)'],
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
