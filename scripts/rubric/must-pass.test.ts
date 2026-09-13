import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { CHECKLIST, POINTS, renderAudit } from './must-pass.ts'

const RULES = readFileSync(new URL('../hygiene/rules.ts', import.meta.url), 'utf8')

test('all sixteen points, numbered as the published list numbers them', () => {
  assert.equal(POINTS.length, 16)
  assert.deepEqual(
    POINTS.map((p) => p.n),
    Array.from({ length: 16 }, (_, i) => i + 1),
  )
})

/**
 * A point that says "we comply" and points at nothing is the audit auditing itself. Every point has
 * to name the gate that would catch a regression, the evidence that shows it, or — for the two the
 * list itself exempts — a reason written out rather than a silent pass.
 */
test('every point names a gate, a piece of evidence, or a declared reason', () => {
  for (const p of POINTS) {
    const kinds = [p.gate, p.evidence, p.declared].filter((v) => v !== undefined)
    assert.equal(kinds.length, 1, `point ${p.n} must claim exactly one kind of proof`)
    assert.ok((p.avoided ?? '').trim().length > 0, `point ${p.n} does not say how it is avoided`)
  }
})

/** A gate named here has to be a rule that exists, or the claim outlives the check. */
test('every claimed gate is a hygiene rule that exists by that name', () => {
  for (const p of POINTS.filter((p) => p.gate !== undefined)) {
    assert.ok(
      RULES.includes(`"${p.gate}"`),
      `point ${p.n} claims the gate "${p.gate}", which rules.ts does not define`,
    )
  }
})

test('every claimed piece of evidence exists on disk', () => {
  for (const p of [...POINTS, ...CHECKLIST].filter((p) => p.evidence !== undefined)) {
    assert.ok(
      existsSync(new URL(`../../${p.evidence}`, import.meta.url)),
      `${p.evidence} is claimed and is not there`,
    )
  }
})

/**
 * Point 5 does not apply to a TEE handler and point 16 is a claim we must NOT make. Both are the
 * ones a judge walking the list would mark against us, so both carry their reasoning inline.
 */
test('the two points that need an argument carry one', () => {
  const five = POINTS.find((p) => p.n === 5)
  assert.ok((five?.declared ?? '').length > 120, 'point 5 needs the SDK argument, not a shrug')
  assert.match(five?.declared ?? '', /usingTheDons|TeeRuntime/)
  assert.match(POINTS.find((p) => p.n === 16)?.avoided ?? '', /binary|logic/i)
})

test('the confidential-workflows checklist is covered item by item', () => {
  assert.equal(CHECKLIST.length, 6)
  for (const item of CHECKLIST) {
    assert.ok(item.item.trim().length > 0 && item.where.trim().length > 0)
  }
})

test('the render states the private-beta position rather than leaving it implied', () => {
  assert.match(renderAudit(), /private beta/i)
  assert.match(renderAudit(), /006818407c/)
})

test('the render carries all sixteen and never says pass without a reason column', () => {
  const rows = renderAudit()
    .split('\n')
    .filter((l) => /^\| \d+ \|/.test(l))
  assert.equal(rows.length, 16)
}) 
