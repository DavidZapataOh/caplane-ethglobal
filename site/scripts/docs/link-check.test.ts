import assert from 'node:assert/strict'
import { test } from 'node:test'
import { brokenLinks } from './link-check.ts'

test('every relative link in content/docs resolves to a real page', () => {
  assert.deepEqual(brokenLinks(), [])
})
