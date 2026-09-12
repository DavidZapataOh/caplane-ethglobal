/**
 * The mode is a property of the host, kept out of `proxy.ts` so it can be tested without Next.
 *
 * Anything off a known host — preview URLs, *.vercel.app, the apex before DNS catches up — falls
 * back to dark rather than rendering with no palette at all.
 */
export const modeFor = (host: string): 'dark' | 'paper' =>
	host.startsWith('registry.') ? 'paper' : 'dark'
