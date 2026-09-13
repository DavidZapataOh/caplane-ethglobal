import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BADGE_VARIANTS } from './badge-variants.ts'
import { renderedPairs } from './contrast.ts'

test('every badge variant clears 4.5:1 in both modes, as the pair it actually renders', () => {
  assert.doesNotThrow(() => renderedPairs(BADGE_VARIANTS, 4.5))
})

test('only "encumbered" wears the seal — the rule the brand is built on', () => {
  for (const [name, v] of Object.entries(BADGE_VARIANTS)) {
    if (name === 'encumbered') {
      assert.equal(v.bg, '--cp-seal')
    } else {
      assert.notEqual(v.bg, '--cp-seal', `${name} must not use the seal fill`)
      assert.notEqual(v.fg, '--cp-seal-text', `${name} must not use the seal as text`)
    }
  }
})

test('six variants: the four from the semantic table, plus two for a claim in flight', () => {
  assert.deepEqual(Object.keys(BADGE_VARIANTS).sort(), [
    'defaulted',
    'encumbered',
    'free',
    'pending',
    'released',
    'verified',
  ])
})

// A claim the enclave has not answered for is not "free" — free is a claim nobody has taken, and
// saying that about one still in flight would tell a second financier the road is clear while the
// first is halfway down it.
test('pending is its own state, never borrowed from free', () => {
  assert.notEqual(BADGE_VARIANTS.pending.className, BADGE_VARIANTS.free.className)
  assert.equal(BADGE_VARIANTS.pending.icon, 'loading')
})

// Defaulted is terminal and colourless, like released: the seal marks a live claim on something,
// and a defaulted lien is no longer one.
test('defaulted wears no seal', () => {
  assert.notEqual(BADGE_VARIANTS.defaulted.bg, '--cp-seal')
  assert.notEqual(BADGE_VARIANTS.defaulted.fg, '--cp-seal-text')
})
