import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ALERT_VARIANTS } from './alert-variants.ts'
import { renderedPairs } from './contrast.ts'

test('every alert variant clears 4.5:1 in both modes', () => {
  assert.doesNotThrow(() => renderedPairs(ALERT_VARIANTS, 4.5))
})

test('"blocked" is a policy refusal, never the seal', () => {
  const v = ALERT_VARIANTS.blocked
  assert.notEqual(v.bg, '--cp-seal')
  assert.notEqual(v.fg, '--cp-seal-text')
  assert.doesNotMatch(v.className, /\bbg-seal\b|\btext-seal-text\b/)
})

test('"error" is also never the seal — a failed transaction is not a lien either', () => {
  const v = ALERT_VARIANTS.error
  assert.notEqual(v.bg, '--cp-seal')
  assert.doesNotMatch(v.className, /\bbg-seal\b|\btext-seal-text\b/)
})
