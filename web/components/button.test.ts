import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BUTTON_VARIANTS } from './button-variants.ts'
import { renderedPairs } from './contrast.ts'

test('every button variant clears 4.5:1 for its label, in both modes', () => {
  assert.doesNotThrow(() => renderedPairs(BUTTON_VARIANTS, 4.5))
})

test('the focus outline pair clears the 3:1 non-text threshold, in both modes', () => {
  // The outline is --cp-text against --cp-ground: SC 1.4.11, not 1.4.3 — it is not text.
  assert.doesNotThrow(() => renderedPairs({ focus: { fg: '--cp-text', bg: '--cp-ground' } }, 3))
})

test('no variant uses a shadow-based ring — outline only', () => {
  for (const v of Object.values(BUTTON_VARIANTS)) {
    assert.doesNotMatch(v.className, /\bring-|\bshadow-(?!none)/)
    assert.match(v.className, /focus-visible:outline/)
  }
})
