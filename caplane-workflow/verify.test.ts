import { readFileSync } from 'node:fs'
import { expect, test } from 'bun:test'

const source = () => readFileSync('./verify.ts', 'utf8')

// Three calls, and the other two are the collision check's and the reserve. A fourth here
// silently takes the margin the next handler needs, and nothing says so until a deployed
// execution dies.
test('the enclave spends exactly three http calls', () => {
	expect(source().match(/sendRequest\(/g) ?? []).toHaveLength(3)
})

// The consensus overload demands a `Runtime`, which a TEE handler never holds. Reaching for
// `usingTheDons()` to get one is how a handler stops being confidential while still compiling.
test('nothing in the enclave asks for a runtime it should not have', () => {
	expect(source()).not.toContain('usingTheDons')
	expect(source()).not.toContain('runInNodeMode')
})

// The name screened is the one the ledger recognises, in the shape the ledger writes it.
// Canonicalising it first returns a clean answer for every multi-word sanctioned entity —
// measured, three of three — and the claim's own identity field is already canonical.
test('the screened name comes from the ledger, not from the claim', () => {
	expect(source()).toContain('invoice?.Contact?.Name')
	expect(source()).not.toContain('claim.debtorTaxId')
})

// A 401 does not throw: `ok()` reads the status code and nothing else, so an expired credential
// would read as "the invoice does not exist" and the claim would be refused for the wrong reason.
test('every response is checked, and the check is the status code', () => {
	expect(source().match(/if \(!ok\(/g) ?? []).toHaveLength(3)
})

// The status code is a fact about the call; the body is the confidential object. Errors do not
// even share a content type — the 404 is plain text and the 400 is JSON — so nothing parses them.
test('a failure carries the status code and never the body', () => {
	for (const message of source().matchAll(/throw new Error\(`([^`]*)`\)/g)) {
		expect(message[1]).toMatch(/^[a-z ]+\$\{\w+\.statusCode\}$/)
	}
})

// Four globals the SDK declares and the enclave does not have. `tsc` passes on all of them, so
// this is the only thing standing between the type checker and a runtime death.
test('no url is built with a global the enclave does not have', () => {
	for (const absent of ['btoa(', 'atob(', 'new URL(', 'URLSearchParams']) {
		expect(source()).not.toContain(absent)
	}
})
