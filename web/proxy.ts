import { NextResponse, type NextRequest } from 'next/server'
import { modeFor } from './mode'

/**
 * What the mode gets prepended to. Written as a literal because Next parses it at compile time and
 * refuses anything it cannot read statically — not even an imported constant — which is why the
 * test extracts it from this file rather than importing it.
 *
 * `/.well-known` must stay out: the certificate validation challenge travels through it, and
 * swallowing it means the domain resolves and never gets a certificate.
 *
 * So must the metadata routes. They are emitted at the root of `app/`, outside `[mode]`, so each
 * exists at exactly one path — prepending a mode to `/icon.svg` asks for `/dark/icon.svg`, which no
 * route serves, and the favicon and the shared-link card 404 on a site whose pages all answer 200.
 */
export const config = {
	matcher: ['/((?!_next|\\.well-known|icon\\.svg|favicon\\.ico|opengraph-image|robots\\.txt|sitemap\\.xml).*)'],
}

/**
 * Reading the host inside the layout instead would work and would opt every route out of
 * prerendering, because headers() is request-time API.
 */
export function proxy(request: NextRequest) {
	const url = request.nextUrl.clone()
	url.pathname = `/${modeFor(request.headers.get('host') ?? '')}${url.pathname}`
	return NextResponse.rewrite(url)
}
