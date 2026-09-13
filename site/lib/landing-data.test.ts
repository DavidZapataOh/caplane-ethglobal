import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  DELIVERABLES,
  assertDeliverablesComplete,
  SPONSOR_SCOPE,
  assertSponsorScope,
  EVIDENCE,
  assertEvidenceReal,
  commandFor,
  REGISTRY_ADDRESS,
} from './landing-data.ts'

const validFixture = DELIVERABLES.map((d) => ({ ...d, href: d.href.includes('REPLACE_') ? '/placeholder' : d.href }))

test('assertDeliverablesComplete passes for 12 well-formed entries', () => {
  assert.doesNotThrow(() => assertDeliverablesComplete(validFixture))
})

test('assertDeliverablesComplete throws when a deliverable is missing an href', () => {
  const broken = validFixture.map((d) => (d.id === 6 ? { ...d, href: '' } : d))
  assert.throws(() => assertDeliverablesComplete(broken), /deliverable 6 \(Registry lookup\) has no href/)
})

test('assertDeliverablesComplete throws on a leftover REPLACE_ placeholder', () => {
  const withPlaceholder = validFixture.map((d) => (d.id === 5 ? { ...d, href: 'https://REPLACE_WITH_REAL_ID' } : d))
  assert.throws(
    () => assertDeliverablesComplete(withPlaceholder),
    /deliverable 5 \(Video\) still has a placeholder href/,
  )
})

test('assertDeliverablesComplete throws when the list is not 12 entries', () => {
  assert.throws(() => assertDeliverablesComplete(validFixture.slice(0, 11)), /expected 12 deliverables, got 11/)
})

test('assertSponsorScope passes for the exact three approved sponsors', () => {
  assert.doesNotThrow(() => assertSponsorScope(SPONSOR_SCOPE))
})

test('assertSponsorScope throws when a 4th sponsor is added', () => {
  assert.throws(
    () => assertSponsorScope([...SPONSOR_SCOPE, 'the-graph']),
    /sponsor scope must have exactly 3 entries, got 4/,
  )
})

test('assertSponsorScope throws when a sponsor outside the approved set replaces one of the three', () => {
  assert.throws(() => assertSponsorScope(['chainlink', 'arc', 'the-graph']), /"the-graph" is outside the 3-sponsor scope/)
})

test('assertSponsorScope throws when scope has fewer than 3 entries', () => {
  assert.throws(() => assertSponsorScope(['chainlink', 'arc']), /sponsor scope must have exactly 3 entries, got 2/)
})

const validEvidenceFixture = EVIDENCE.map((e) => ({
  ...e,
  proofHref: e.proofHref.includes('REPLACE_') ? 'https://example.invalid/placeholder' : e.proofHref,
}))

test('assertEvidenceReal passes for well-formed evidence entries', () => {
  assert.doesNotThrow(() => assertEvidenceReal(validEvidenceFixture))
})

test('assertEvidenceReal throws on an empty detail field', () => {
  const broken = validEvidenceFixture.map((e) => (e.id === 'fmr' ? { ...e, detail: '' } : e))
  assert.throws(() => assertEvidenceReal(broken), /evidence entry "fmr" has a placeholder or empty field/)
})

test('assertEvidenceReal throws on a leftover REPLACE_ placeholder in a proof link', () => {
  const broken = validEvidenceFixture.map((e) => (e.id === 'tests' ? { ...e, proofHref: 'https://REPLACE_ORG/x' } : e))
  assert.throws(() => assertEvidenceReal(broken), /evidence entry "tests" has a placeholder or empty field/)
})

test('commandFor("developer", ...) interpolates the real registry address', () => {
  const snippet = commandFor('developer', REGISTRY_ADDRESS)
  assert.match(snippet, /0xe7170ee0ce4cab4593970ef5c4ebf7d0d62ae19b/)
  assert.match(snippet, /npm install caplane-sdk/)
  assert.match(snippet, /quorum: true/)
})

test('commandFor("business", ...) returns the exact README grep command', () => {
  assert.equal(
    commandFor('business', REGISTRY_ADDRESS),
    '! grep -q onlyOwner contracts/src/CaplaneRegistry.sol && echo "no owner, no admin, no pause"',
  )
})

test('commandFor("financier", ...) links to the real Arcscan read-contract page', () => {
  assert.equal(
    commandFor('financier', REGISTRY_ADDRESS),
    'https://testnet.arcscan.app/address/0xe7170ee0ce4cab4593970ef5c4ebf7d0d62ae19b#readContract',
  )
})

test('REGISTRY_ADDRESS matches the vendored deployments.arc-testnet.json', () => {
  const deploymentsPath = fileURLToPath(new URL('../abi/deployments.arc-testnet.json', import.meta.url))
  const deployments = JSON.parse(readFileSync(deploymentsPath, 'utf8')) as { registry: string }
  assert.equal(REGISTRY_ADDRESS, deployments.registry)
})
