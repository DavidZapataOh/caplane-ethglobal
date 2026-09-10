import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { ICON_NAMES } from './icon-names.js'

const sprite = () => readFileSync(new URL('./sprite.svg', import.meta.url), 'utf8')

/** Comments are not markup. Checking them would flag the comment that documents the rule. */
const markup = () => sprite().replace(/<!--[\s\S]*?-->/g, '')

// 36 domain nouns plus 4 pieces of interface chrome. The chrome exists because three later
// objectives need states and affordances the domain set has no icon for, and borrowing one
// would break its semantics — `rejected` is a registry status, not a network error.
test('ships exactly the approved icons, with no duplicates', () => {
  assert.equal(ICON_NAMES.length, 40)
  assert.equal(new Set(ICON_NAMES).size, 40)
})

test('every icon name is an English kebab-case identifier', () => {
  for (const n of ICON_NAMES) assert.match(n, /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, n)
})

test('the sprite carries no style block — Firefox and WebKit ignore it across documents', () => {
  assert.ok(!/<style[\s>]/.test(markup()), 'a <style> block makes external <use> render solid black')
})

test('every symbol declares the spec as presentation attributes', () => {
  const symbols = sprite().match(/<symbol[^>]*>/g) ?? []
  assert.equal(symbols.length, 40)
  for (const s of symbols) {
    assert.ok(s.includes('viewBox="0 0 24 24"'), s)
    assert.ok(s.includes('fill="none"'), s)
    assert.ok(s.includes('stroke="currentColor"'), s)
    assert.ok(s.includes('stroke-linecap="butt"'), s)
    assert.ok(s.includes('stroke-linejoin="miter"'), s)
  }
})

test('no symbol hardcodes a colour — every icon inherits from its consumer', () => {
  assert.ok(!/(stroke|fill)="#/.test(markup()), 'a hardcoded colour breaks dark and paper modes')
})

// Two representations of the same set can drift apart in silence. This is what stops them.
test('the component and the sprite expose the same names', () => {
  const ids = [...sprite().matchAll(/id="i-([^"]+)"/g)].map((m) => m[1])
  assert.deepEqual([...ids].sort(), [...ICON_NAMES].sort())
})
