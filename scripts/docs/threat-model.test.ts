import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { THREATS, renderThreatModel } from './threat-model.ts'

test('exactly six attack variants, no more and no fewer', () => {
  assert.equal(THREATS.length, 6)
  assert.deepEqual(
    THREATS.map((t) => t.id).sort(),
    [
      'enclave-impersonation',
      'malicious-release',
      'near-collision-squatting',
      'preemptive-poisoning',
      'registrar-equivocation',
      'unilateral-operator-registration',
    ],
  )
})

/**
 * A closure has to point at a line someone can open, not at a description of intent. Written as a
 * general `path:line` rather than as a Solidity path: one of the six is closed in the matcher and
 * not in a contract, and a regex that demanded `.sol` would have forced that row to claim a closure
 * in the wrong place to satisfy its own test.
 */
test('every closed variant names a real file and line, and the file exists', () => {
  for (const t of THREATS.filter((t) => t.closed)) {
    assert.match(t.anchor, /^[\w/.-]+\.(sol|ts):\d+$/, `${t.id} needs a file:line anchor`)
    const [path] = t.anchor.split(':')
    assert.ok(existsSync(new URL(`../../${path}`, import.meta.url)), `${t.anchor} points at nothing`)
  }
})

/** An anchor that survives a refactor by pointing at a blank line proves nothing. */
test('each anchor lands on a line that carries the guard it claims', () => {
  const at = (anchor: string) => {
    const [path, line] = anchor.split(':')
    const source = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8').split('\n')
    return source[Number(line) - 1] ?? ''
  }
  const byId = Object.fromEntries(THREATS.map((t) => [t.id, t]))
  assert.match(at(byId['unilateral-operator-registration']!.anchor), /revert NotForwarder/)
  assert.match(at(byId['near-collision-squatting']!.anchor), /THRESHOLD/)
  assert.match(at(byId['preemptive-poisoning']!.anchor), /submitterOf/)
})

test('preemptive poisoning is declared open, not soft-pedalled as mitigated', () => {
  const row = THREATS.find((t) => t.id === 'preemptive-poisoning')
  assert.equal(row?.closed, false)
  assert.equal(row?.kind, 'open')
  assert.match(row?.closure ?? '', /0\.00094|47,192/)
})

test('two variants share one revert, and say so with the same anchor', () => {
  const unilateral = THREATS.find((t) => t.id === 'unilateral-operator-registration')
  const impersonation = THREATS.find((t) => t.id === 'enclave-impersonation')
  assert.equal(unilateral?.anchor, impersonation?.anchor)
  assert.match(unilateral?.anchor ?? '', /CaplaneRegistry\.sol:57/)
})

test('the render produces a six-row table with a header', () => {
  const rows = renderThreatModel()
    .split('\n')
    .filter((line) => line.startsWith('|') && !line.includes('---'))
  assert.equal(rows.length, 7)
})

test('the render never claims a closure it did not declare', () => {
  assert.match(renderThreatModel(), /\*\*Open\.\*\*/)
})

/**
 * The renderer owns the word, not the data. Both saying it produced "**Open.** Open. Measured…" in
 * the generated document — the kind of error that survives review because everyone reads the data
 * and nobody reads the output.
 */
test('the open marker is written once, by the renderer', () => {
  for (const t of THREATS) {
    assert.doesNotMatch(t.closure, /^Open\b/, `${t.id} states its own openness; the renderer does that`)
  }
  assert.doesNotMatch(renderThreatModel(), /\*\*Open\.\*\*\s*Open\b/)
})
