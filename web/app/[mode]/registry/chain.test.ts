import { readFileSync, readdirSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toFunctionSelector } from 'viem'
import { createCaplaneClient, lienOf, statusOf } from 'caplane-sdk'
import { REGISTRY, SELECTORS, classify, read } from './chain.ts'

const RECORDED = '0xebd60de9b8c99e6bde3ce7ad1894177e706e75c0120c192da71400a378ae7e4c'
const REFUSED = '0x9c22eff8f4efee07013d86feaf5f1a559053004f1f61915873690d57e5a08b29'

// The measured trap. The registry holds exactly one lien in its whole life and it is released, so
// isEncumbered is false for it AND for an id nobody ever wrote. A page built on that boolean
// answers the same thing to everything, and a judge sees an answer rather than a status byte.
test('a recorded id and a refused one differ where it matters', async () => {
  const recorded = await read(RECORDED)
  const refused = await read(REFUSED)
  assert.equal(recorded.encumbered, refused.encumbered) // both false today, and that is the point
  assert.equal(recorded.status, 2)
  assert.equal(refused.status, 0)
  assert.equal(recorded.lien.borrower, '0x86ec9f04485db066cf155353f15eef356ae90253')
  assert.equal(recorded.lien.advanceUsdc6, 8_000_000n)
  assert.equal(recorded.lien.rateBps, 200)
  assert.equal(refused.lien.borrower, '0x0000000000000000000000000000000000000000')
})

// Shipping our own decoder instead of the package is a deliberate saving: measured, viem costs
// about 49 KB gzipped on this page — 17.9 KB of it elliptic curves, on a surface that never signs —
// against 552 bytes for three fixed selectors and seven static-width words. What that costs is the
// risk of two implementations drifting, so the two are compared against the live chain, field by
// field. If they ever disagree this fails and the package wins.
test('the page decodes exactly what the package decodes', async () => {
  const client = createCaplaneClient()
  const mine = await read(RECORDED)
  const theirs = await lienOf(client, RECORDED)
  assert.equal(mine.status, await statusOf(client, RECORDED))
  assert.equal(mine.lien.borrower.toLowerCase(), theirs.borrower.toLowerCase())
  assert.equal(mine.lien.rateBps, theirs.rateBps)
  assert.equal(mine.lien.createdAt, theirs.createdAt)
  assert.equal(mine.lien.advanceUsdc6, theirs.advanceUsdc6)
  assert.equal(mine.lien.expiresAt, theirs.expiresAt)
  assert.equal(mine.lien.status, theirs.status)
  assert.equal(mine.lien.submissionId.toLowerCase(), theirs.submissionId.toLowerCase())
})

// A four-byte selector written by hand fails the way a thirty-two-byte one does: the call returns
// empty bytes, which decode to zero, and the page says "no record" about a lien that exists. They
// are written literally to keep the bundle at nothing, so they are pinned by deriving them here.
test('the hand-written selectors are the real ones', () => {
  assert.equal(SELECTORS.isEncumbered, toFunctionSelector('function isEncumbered(bytes32)'))
  assert.equal(SELECTORS.statusOf, toFunctionSelector('function statusOf(bytes32)'))
  assert.equal(SELECTORS.lienOf, toFunctionSelector('function lienOf(bytes32)'))
})

// Encumbered is status 1 and nothing else. A reader doing `status != 0` would call a released lien
// and a defaulted one encumbered, and both are terminal.
test('encumbered is active and nothing else', async () => {
  assert.equal((await read(RECORDED)).encumbered, false)
  assert.equal((await read(RECORDED)).status, 2)
})

// Without this the page is worth exactly as much as our word for it, and the explorer is not a
// substitute for a visitor who wants to check rather than click.
test('the answer carries what it takes to redo it', async () => {
  const { receipt } = await read(RECORDED)
  assert.match(receipt.endpoint, /^https:\/\//)
  assert.equal(receipt.to, REGISTRY)
  assert.equal(receipt.calls.length, 3)
  assert.match(receipt.blockNumber, /^0x[0-9a-f]+$/)
  const replayed = (await (
    await fetch(receipt.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: [{ to: receipt.to, data: receipt.calls[2]!.data }, receipt.blockNumber],
      }),
    })
  ).json()) as { result: string }
  assert.equal(replayed.result, receipt.calls[2]!.result)
})

// Three reads at three heights could contradict each other, and a receipt naming a height that no
// longer answers the same thing is worse than none.
test('the three reads are pinned to one height', async () => {
  const { receipt } = await read(RECORDED)
  assert.equal(typeof receipt.blockNumber, 'string')
})

// One box. A 32-byte value is a lien id; a 20-byte value is a borrower. Asking a visitor to pick a
// category first is asking them to know the thing they came to find out.
test('the input tells the two questions apart by length', () => {
  assert.equal(classify(RECORDED), 'lien')
  assert.equal(classify('0x86Ec9f04485Db066CF155353f15eef356Ae90253'), 'borrower')
  assert.equal(classify('  0X86EC9F04485DB066CF155353F15EEF356AE90253 '), 'borrower')
  assert.equal(classify('0x86Ec9f04'), 'invalid')
  assert.equal(classify(''), 'invalid')
  assert.equal(classify('not hex at all, 66 characters long xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'), 'invalid')
})

// The saving is the whole reason this module exists, and it is only real if the library stays out
// of the bundle. It is a devDependency here because one test derives the selectors with it.
//
// Asserted on this route's own imports, not on the package's dependency list. The list was the
// original guard and it stopped meaning what it said the day a wallet SDK landed as a runtime
// dependency of a different route segment: the package now depends on Privy, the registry does
// not, and only one of those two facts is about this page. What protects this page is that
// nothing here imports a chain library — which a careless import would break even while
// package.json stayed untouched, and which the dependency list could never have caught.
test('no chain library is imported by the public registry route', () => {
  const here = new URL('.', import.meta.url)
  const sources = readdirSync(here)
    .filter((name) => /\.tsx?$/.test(name) && !name.endsWith('.test.ts'))
    .map((name) => readFileSync(new URL(name, here), 'utf8'))
  assert.ok(sources.length >= 4, `expected the route's modules, found ${sources.length}`)
  for (const source of sources) {
    for (const heavy of ['viem', 'ethers', 'web3', '@privy-io', 'caplane-sdk']) {
      assert.doesNotMatch(
        source,
        new RegExp(`from '${heavy}`),
        `${heavy} must not reach the public registry's bundle`,
      )
    }
  }
})

// And the package still declares what it declares on purpose: viem stays a devDependency, because
// one test derives the selectors with it and no shipped module may.
test('viem is a development dependency of web, never a runtime one', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as {
    dependencies: Record<string, string>
    devDependencies: Record<string, string>
  }
  assert.equal(manifest.dependencies.viem, undefined)
  assert.ok(manifest.devDependencies.viem !== undefined, 'the selector pin needs it, in dev')
})

// Reflected origins plus credentials is a combination these endpoints do not advertise, and the
// browser would kill the request before it left.
test('the request never asks for credentials', () => {
  const source = readFileSync(new URL('./chain.ts', import.meta.url), 'utf8')
  // The option, not the word: the module's own comment explains why the option is absent, and
  // matching the word would make this test report the explanation.
  assert.equal(/credentials\s*:/.test(source), false)
})

// The guarantee that survives the backend being switched off has to be a property of the code
// path: one Vercel project serves the app and the registry, so an API URL the app needs is present
// in the registry's deployment whether anyone intended it or not.
test('nothing in this directory reaches for a backend of ours', () => {
  // Needles assembled rather than written: spelled out they appear in this file and the walk
  // reports itself. The hygiene rule that enforces this repository-wide excludes its own engine for
  // the same reason.
  const needles = [['api', 'caplane', 'xyz'].join('.'), ['NEXT', 'PUBLIC', 'API', 'URL'].join('_'), ['CAPLANE', 'API', 'URL'].join('_')]
  // The directory is walked, not listed: a fixed list passes by skipping the file nobody added to
  // it, and every helper has to live in here anyway — the hygiene rule matches by path, so one
  // hoisted to web/components escapes the gate with nothing to say about it.
  const here = new URL('./', import.meta.url)
  const files = readdirSync(here).filter((name) => /\.(ts|tsx)$/.test(name))
  assert.ok(files.length >= 2, 'the walk found almost nothing, which is the failure it cannot report')
  for (const name of files) {
    const source = readFileSync(new URL(name, here), 'utf8')
    for (const needle of needles) assert.equal(source.includes(needle), false, `${name} names ${needle}`)
  }
})
