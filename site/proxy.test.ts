import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

/**
 * Read from the source rather than imported: Next parses the matcher at compile time and rejects
 * anything that is not a literal, so the one place it can live is the file that declares it.
 */
const MATCHER = JSON.parse(
  `"${readFileSync(new URL('./proxy.ts', import.meta.url), 'utf8').match(/matcher: \['(.+)'\]/)![1]!}"`,
) as string

// Anchored, because Next anchors a matcher and a bare RegExp does not: unanchored, every path with
// a second slash slips past the lookahead at the wrong offset and the test passes on a matcher
// that excludes nothing.
const matcher = new RegExp(`^${MATCHER}$`)

/**
 * The matcher decides what the mode gets prepended to, and prepending it to a file is the same as
 * deleting the file: `/icon.png` becomes `/dark/icon.png`, which no route serves. These are emitted
 * at the root of `app/`, outside `[mode]`, so they exist at one path and one only — and a favicon
 * that 404s on a site whose every page answers 200 is invisible until someone looks at a tab.
 */
test('the root metadata routes are left alone', () => {
  for (const path of [
    '/icon.png',
    '/apple-icon.png',
    '/opengraph-image',
    '/favicon.ico',
    '/robots.txt',
    // Middleware runs before a file in `public/` is served, so an asset the page loads by URL is
    // rewritten like a route and answers 404 — the image renders as its own alt text.
    '/architecture.svg',
  ]) {
    assert.equal(matcher.test(path), false, `${path} must not be rewritten`)
  }
})

test('the pages a visitor types still are', () => {
  for (const path of ['/', '/anything']) {
    assert.equal(matcher.test(path), true, `${path} must be rewritten`)
  }
})

test('the build output and the certificate challenge stay out', () => {
  assert.equal(matcher.test('/_next/static/chunks/a.js'), false)
  assert.equal(matcher.test('/.well-known/acme-challenge/x'), false)
})

/**
 * The general case, added after the same failure twice: first the favicon, then the architecture
 * diagram. A page route in this app never carries a file extension, so anything that does is a file
 * and must reach it unprefixed — without anyone remembering to name it here.
 */
test('any asset with an extension is left alone, named or not', () => {
  for (const path of ['/architecture.svg', '/anything.png', '/a/nested/asset.woff2', '/x.json']) {
    assert.equal(matcher.test(path), false, `${path} must not be rewritten`)
  }
})

test('and a page is still a page', () => {
  for (const path of ['/', '/docs', '/docs/getting-started']) {
    assert.equal(matcher.test(path), true, `${path} must be rewritten`)
  }
})
