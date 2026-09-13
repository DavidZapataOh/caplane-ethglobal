import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const DOCS_DIR = join(import.meta.dirname, '../../content/docs')

/**
 * The route Fumadocs mounts an `.mdx` file at, mirroring `loader({ baseUrl: '/' })` in
 * `lib/source.ts`: an `index.mdx` takes its own directory's route, every other file drops its
 * extension.
 */
const routeFor = (mdxPath: string): string => {
  const withoutExtension = relative(DOCS_DIR, mdxPath).replace(/\.mdx$/, '')
  const segments = withoutExtension.split(sep).filter((segment) => segment !== 'index')
  return segments.join('/')
}

const allMdxFiles = (): string[] =>
  readdirSync(DOCS_DIR, { recursive: true })
    .filter((entry): entry is string => typeof entry === 'string' && entry.endsWith('.mdx'))
    .map((entry) => join(DOCS_DIR, entry))

/** Every route a real page under `content/docs` resolves to. */
export const knownRoutes = (): Set<string> => new Set(allMdxFiles().map(routeFor))

const LINK = /\[[^\]]*\]\((\.\/[^)\s]+|\/[^)\s]+)\)/g

/**
 * Resolves a relative markdown link the way a browser resolves it against the page's own URL:
 * the target replaces the last segment of the current route unless the link starts with `/`.
 * This is exactly the rule that made `./lien` from the page at `/sdk` land on `/lien` instead of
 * `/sdk/lien` — the bug this check exists to catch.
 */
const resolveLink = (fromRoute: string, link: string): string => {
  const withoutFragment = link.split('#')[0]!
  const resolved = new URL(withoutFragment, `http://docs/${fromRoute}`)
  return resolved.pathname.replace(/^\/|\/$/g, '')
}

export type BrokenLink = { file: string; link: string; target: string }

/** Every relative link in `content/docs/**` that does not resolve to a real page. */
export const brokenLinks = (): BrokenLink[] => {
  const routes = knownRoutes()
  const broken: BrokenLink[] = []
  for (const file of allMdxFiles()) {
    const fromRoute = routeFor(file)
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(LINK)) {
      const link = match[1]!
      const target = resolveLink(fromRoute, link)
      if (!routes.has(target)) broken.push({ file: relative(DOCS_DIR, file), link, target })
    }
  }
  return broken
}
