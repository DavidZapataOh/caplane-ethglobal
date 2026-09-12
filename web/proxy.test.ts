import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { modeFor } from './mode.ts'

/**
 * Read from the source rather than imported: Next parses the matcher at compile time and rejects
 * anything that is not a literal, so the one place it can live is the file that declares it.
 */
const MATCHER = JSON.parse(
  `"${readFileSync(new URL('./proxy.ts', import.meta.url), 'utf8').match(/matcher: \['(.+)'\]/)![1]!}"`,
) as string

// Anchored, because Next anchors a matcher and a bare RegExp does not: unanchored, every path
// with a second slash slips past the lookahead at the wrong offset and the test passes on a
// matcher that excludes nothing.
const matcher = new RegExp(`^${MATCHER}$`)

/**
 * The matcher decides what the mode gets prepended to, and prepending it to a file is the same as
 * deleting the file: `/icon.svg` becomes `/dark/icon.svg`, which no route serves. These are emitted
 * at the root of `app/`, outside `[mode]`, so they exist at one path and one only.
 */
test('the root metadata routes are left alone', () => {
  for (const path of ['/icon.svg', '/opengraph-image', '/favicon.ico', '/robots.txt']) {
    assert.equal(matcher.test(path), false, `${path} must not be rewritten`)
  }
})

test('the pages a visitor types still are', () => {
  for (const path of ['/', '/registry', '/confirm']) {
    assert.equal(matcher.test(path), true, `${path} must be rewritten`)
  }
})

test('the build output and the certificate challenge stay out', () => {
  assert.equal(matcher.test('/_next/static/chunks/a.js'), false)
  assert.equal(matcher.test('/.well-known/acme-challenge/x'), false)
})

test('the mode is a property of the host', () => {
  assert.equal(modeFor('registry.caplane.xyz'), 'paper')
  assert.equal(modeFor('app.caplane.xyz'), 'dark')
  assert.equal(modeFor('caplane-ethglobal.vercel.app'), 'dark')
  assert.equal(modeFor(''), 'dark')
})
