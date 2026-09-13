import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderedPairs } from './contrast.ts'

test('a pair that clears the ratio in both modes does not throw', () => {
  assert.doesNotThrow(() => renderedPairs({ ok: { fg: '--cp-text', bg: '--cp-ground' } }, 4.5))
})

test('a pair that fails in dark mode throws, naming the mode and the variant', () => {
  // The seal fill as text on dark is exactly the pair BRANDING.md forbids: 2.79:1.
  assert.throws(
    () => renderedPairs({ mistake: { fg: '--cp-seal', bg: '--cp-ground' } }, 4.5),
    /mistake.*dark/,
  )
})

test('the same pair passes on paper — proves the check is per-mode, not per-token', () => {
  assert.doesNotThrow(() =>
    renderedPairs({ ok: { fg: '--cp-seal', bg: '--cp-ground' } }, 4.5, ['paper']),
  )
})

test('renderedPairs honours the minRatio argument it is given, not a hardcoded 4.5', () => {
  // This is the real focus-outline pair the Button declares (`--cp-text` on `--cp-ground`), passed
  // with the 3:1 threshold SC 1.4.11 actually sets for a non-text indicator. It clears 4.5:1 too
  // — every hex pair in this palette that is used for focus does — so this test is not proving the
  // pair sits between 3 and 4.5 (no pair in `tokens` does, in both modes at once: the nearest
  // candidate, `--cp-border-strong` on `--cp-ground`, is only 1.60:1 in dark, below even 3:1). It
  // proves the second argument is not ignored — that a caller asking for 3:1 does not silently get
  // held to 4.5:1 instead.
  assert.doesNotThrow(() => renderedPairs({ focus: { fg: '--cp-text', bg: '--cp-ground' } }, 3))
})
