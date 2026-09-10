import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { contrast, tokens } from './contrast.js'

const TEXT_ROLES = ['--cp-text', '--cp-text-2', '--cp-text-3', '--cp-seal-text', '--cp-verified-text']

test('computes a known WCAG ratio from scratch', () => {
  // Black on white is 21:1 exactly. Hand-derived, not read from any document.
  assert.equal(Math.round(contrast('#000000', '#FFFFFF') * 100) / 100, 21)
})

test('every text role clears 4.5:1 against its ground, in dark mode', () => {
  for (const role of TEXT_ROLES) {
    assert.ok(contrast(tokens.dark[role], tokens.dark['--cp-ground']) >= 4.5, `${role} fails in dark`)
  }
})

test('every text role clears 4.5:1 against its ground, in paper mode', () => {
  for (const role of TEXT_ROLES) {
    assert.ok(contrast(tokens.paper[role], tokens.paper['--cp-ground']) >= 4.5, `${role} fails in paper`)
  }
})

// The pair is the point. A test that simply forbade the seal hex as text would be false:
// the same hex fails on one ground and passes on the other, which is why two roles exist.

test('the seal fill is NOT usable as text on dark — that is why seal-text exists', () => {
  assert.ok(contrast(tokens.dark['--cp-seal'], tokens.dark['--cp-ground']) < 4.5)
})

test('the same seal hex IS usable as text on paper', () => {
  assert.ok(contrast(tokens.paper['--cp-seal'], tokens.paper['--cp-ground']) >= 4.5)
})

test('radius is zero and shadow is none in both modes', () => {
  for (const mode of ['dark', 'paper']) {
    assert.equal(tokens[mode]['--cp-radius'] ?? '0', '0')
    assert.equal(tokens[mode]['--cp-shadow'] ?? 'none', 'none')
  }
})

// The stylesheet is what ships to browsers and the map is what ships to JavaScript. They are
// two copies of the same values, so nothing but this stops one from drifting off the other.
test('the stylesheet and the exported map carry identical values', () => {
  const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')
  const blocks = {
    dark: css.slice(css.indexOf(':root {'), css.indexOf(':root[data-mode="paper"]')),
    paper: css.slice(css.indexOf(':root[data-mode="paper"]')),
  }
  for (const [mode, block] of Object.entries(blocks)) {
    const declared = Object.fromEntries(
      [...block.matchAll(/(--cp-[a-z0-9-]+):\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]),
    )
    assert.deepEqual(declared, tokens[mode], `${mode} block differs from tokens.${mode}`)
  }
})
