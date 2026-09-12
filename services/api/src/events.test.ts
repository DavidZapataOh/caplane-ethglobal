import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { WATCHED, decode } from './events.js'

const REGISTRY = '0xe7170ee0ce4cab4593970ef5c4ebf7d0d62ae19b' as const

// CaplanePool inherits ERC4626, so four of its events are declared nowhere in contracts/src.
// Measured: 4 of the 17 logs on chain are those four — a quarter of the feed. A watcher built only
// from the contract files drops them and reports nothing about it.
test('the inherited pool events are watched too', () => {
  const names = WATCHED.map((event) => event.name)
  for (const inherited of ['Transfer', 'Approval', 'Deposit', 'Withdraw']) {
    assert.ok(names.includes(inherited), `${inherited} is not watched`)
  }
  assert.equal(WATCHED.length, 15)
  assert.equal(new Set(WATCHED.map((event) => event.topic0)).size, 15)
})

// A 32-byte literal transcribed by hand fails in a way nothing reports: the filter silently matches
// nothing. Every selector has to come out of its signature, and so does every decoder — the
// generated ABI carries only two of the four contracts, so signatures are the single source here.
test('no selector and no decoder is transcribed by hand', () => {
  const source = readFileSync(new URL('../../src/events.ts', import.meta.url), 'utf8')
  assert.equal(/0x[0-9a-fA-F]{64}/.test(source), false)
})

test('a rejection decodes to its reason, named', () => {
  const decoded = decode({
    address: REGISTRY,
    topics: [
      WATCHED.find((event) => event.name === 'SubmissionRejected')!.topic0,
      '0x9c22eff8f4efee07013d86feaf5f1a559053004f1f61915873690d57e5a08b29',
    ],
    data: '0x0000000000000000000000000000000000000000000000000000000000000001',
    blockNumber: '0x3ad441a',
    logIndex: '0x7',
    transactionHash: '0xd75c4e742288a159f8ddb2e84745f7d39ead7b654dabb7c7a46df8c667ba0941',
  })
  assert.equal(decoded?.name, 'SubmissionRejected')
  assert.equal(decoded?.fields.reasonCode, '1')
  assert.equal(decoded?.reason, 'AlreadyEncumbered')
  assert.equal(decoded?.blockNumber, '61686810')
})

// uint256 amounts have to survive as decimal text: JSON has no bigint, and a Number would lose
// precision above 2^53 without saying so.
test('an amount survives as decimal text', () => {
  const decoded = decode({
    address: '0x4df4c8d722b3a9ebd18b9094c883b5ff83565d7c',
    topics: [
      WATCHED.find((event) => event.name === 'Disbursed')!.topic0,
      '0xebd60de9b8c99e6bde3ce7ad1894177e706e75c0120c192da71400a378ae7e4c',
      '0x00000000000000000000000086ec9f04485db066cf155353f15eef356ae90253',
    ],
    data: '0x00000000000000000000000000000000000000000000000000000000007a1200',
    blockNumber: '0x1',
    logIndex: '0x0',
    transactionHash: '0x00',
  })
  assert.equal(decoded?.fields.amount, '8000000')
  assert.equal(typeof decoded?.fields.amount, 'string')
})

// An unknown topic is not an error and not a silent drop: the service has to keep running when a
// contract it does not know starts emitting.
test('an unwatched topic decodes to nothing', () => {
  assert.equal(
    decode({
      address: REGISTRY,
      topics: ['0x1111111111111111111111111111111111111111111111111111111111111111'],
      data: '0x',
      blockNumber: '0x1',
      logIndex: '0x0',
      transactionHash: '0x00',
    }),
    undefined,
  )
})

// Two events share a name across contracts — Paid is the escrow's, Repaid the pool's — so a decoder
// keyed only on name would mix them. The address travels with every entry.
test('every entry carries the contract it came from', () => {
  const decoded = decode({
    address: REGISTRY,
    topics: [
      WATCHED.find((event) => event.name === 'LienReleased')!.topic0,
      '0xebd60de9b8c99e6bde3ce7ad1894177e706e75c0120c192da71400a378ae7e4c',
    ],
    data: '0x',
    blockNumber: '0x1',
    logIndex: '0x0',
    transactionHash: '0x00',
  })
  assert.equal(decoded?.address, REGISTRY)
})
