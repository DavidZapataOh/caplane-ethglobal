import { readFileSync, writeFileSync } from 'node:fs'
import { expect, test } from 'bun:test'
// Reached through `node_modules` on purpose. The package's `exports` map does not publish these
// validators — measured: the bare specifier does not resolve — and its own compile pipeline is the
// only intended caller. Its header states they never throw. A future version may move or rename it
// without calling that a breaking change, in which case this test fails loudly, which is the right
// way to find out. What is NOT done here is reimplementing their analysis.
import { checkWorkflowDeterminism } from './node_modules/@chainlink/cre-sdk/scripts/src/validate-workflow-determinism'

const HANDLERS = ['./workflow.ts', './main.ts']

// The SDK detects Date.now(), new Date(), for...in, unsorted Object.keys/values/entries and
// Promise.race/any/all across the entry file and everything it transitively imports — then only
// warns. A warning nobody reads is how a clock reaches a DON, where it surfaces as a consensus
// disagreement: the most expensive place in the system to discover it.
test('the workflow carries no source of non-determinism', () => {
	for (const entry of HANDLERS) expect(checkWorkflowDeterminism(entry)).toEqual([])
})

// And the gate has to bite. A validator wired up wrong returns an empty array for every input,
// which is indistinguishable from a clean workflow until the day it matters.
test('the gate catches a clock', () => {
	const original = readFileSync('./workflow.ts', 'utf8')
	try {
		writeFileSync('./workflow.ts', `${original}\nexport const _probe = () => Date.now()\n`)
		const found = checkWorkflowDeterminism('./workflow.ts')
		expect(found.length).toBeGreaterThan(0)
	} finally {
		writeFileSync('./workflow.ts', original)
	}
})

// It reaches through imports, so a clock hidden in a module the handler pulls in is caught too.
// That is the case a per-file check would miss, and the enclave has six modules now.
test('the gate reaches a clock behind an import', () => {
	const original = readFileSync('./report.ts', 'utf8')
	try {
		writeFileSync('./report.ts', `${original}\nexport const _probe = () => new Date()\n`)
		expect(checkWorkflowDeterminism('./workflow.ts').length).toBeGreaterThan(0)
	} finally {
		writeFileSync('./report.ts', original)
	}
})

// Unsorted key iteration is the quiet one: it never throws and produces a different order per
// engine, which is exactly the shape that survives every other gate in this repository.
test('the gate catches unsorted key iteration', () => {
	const original = readFileSync('./report.ts', 'utf8')
	try {
		writeFileSync(
			'./report.ts',
			`${original}\nexport const _probe = (o: object) => Object.keys(o).join('')\n`,
		)
		expect(checkWorkflowDeterminism('./workflow.ts').length).toBeGreaterThan(0)
	} finally {
		writeFileSync('./report.ts', original)
	}
})

// `Math.random()` is deliberately NOT flagged, and that is the SDK's call, not an oversight: the
// javy plugin replaces it with a seeded ChaCha8 that is deterministic in node mode. Pinned here so
// nobody 'fixes' the gate by adding it — and the repository's own hygiene rule covers what this
// validator does not look at (Intl, toLocaleString, the RegExp v flag) without overlapping.
test('the seeded random is not treated as non-determinism', () => {
	const original = readFileSync('./report.ts', 'utf8')
	try {
		writeFileSync('./report.ts', `${original}\nexport const _probe = () => Math.random()\n`)
		expect(checkWorkflowDeterminism('./workflow.ts')).toEqual([])
	} finally {
		writeFileSync('./report.ts', original)
	}
})
