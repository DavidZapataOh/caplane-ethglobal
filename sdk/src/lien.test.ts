import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createCaplaneClient } from './client.js'
import { LienStatus, isEncumbered, lienOf, statusOf } from './lien.js'

// The first lien ever recorded on Arc Testnet. It was recorded, collided against, and released, so
// it is the one lien whose whole life is already on chain.
const RELEASED = '0xebd60de9b8c99e6bde3ce7ad1894177e706e75c0120c192da71400a378ae7e4c' as const
// A submission the enclave refused. A real id the registry knows and that is not a lien — a better
// negative than an invented one, because it is the case a lender actually meets.
const REFUSED = '0x9c22eff8f4efee07013d86feaf5f1a559053004f1f61915873690d57e5a08b29' as const

const client = createCaplaneClient()

// The whole point: a third party reads a lien's terms out of chain state, with no account.
test('a lien reads back with its terms', async () => {
  const lien = await lienOf(client, RELEASED)
  assert.equal(lien.borrower, '0x86Ec9f04485Db066CF155353f15eef356Ae90253')
  assert.equal(lien.advanceUsdc6, 8_000_000n)
  assert.equal(lien.rateBps, 200)
  assert.equal(lien.status, LienStatus.Released)
  assert.equal(lien.submissionId, '0xdb0577a4e0025f56d6b8e3f71871a42dccb2bc6447aa366685b42d33505752b3')
})

// Encumbered is status exactly Active. A reader doing `status != 0` would call a released lien
// encumbered, which is the answer that blocks a refinancing the registry deliberately allows.
test('released is not encumbered, and the two are told apart', async () => {
  assert.equal(await statusOf(client, RELEASED), LienStatus.Released)
  assert.equal(await isEncumbered(client, RELEASED), false)
})

// Measured, and it is the trap of every surface built on this package: isEncumbered answers false
// for the released lien AND for an id the registry never wrote. The divergence lives in statusOf
// and in lienOf, so a reading built on the boolean alone proves nothing about the chain.
test('the boolean cannot tell them apart but the status can', async () => {
  assert.equal(await isEncumbered(client, RELEASED), await isEncumbered(client, REFUSED))
  assert.notEqual(await statusOf(client, RELEASED), await statusOf(client, REFUSED))
  assert.equal(await statusOf(client, REFUSED), LienStatus.None)
  assert.equal((await lienOf(client, REFUSED)).borrower, '0x0000000000000000000000000000000000000000')
})

// An id nobody ever recorded is absent, not an error. That is the answer a lender checking an
// unknown id has to get.
test('an unknown lien is absent, not an error', async () => {
  const unknown = `0x${'ff'.repeat(32)}` as const
  assert.equal(await statusOf(client, unknown), LienStatus.None)
  assert.equal(await isEncumbered(client, unknown), false)
})

// uint128 and uint64 exceed what a JS number holds. A lien of 2^53 base units loses precision
// silently if any of them is degraded.
test('money and time stay bigint', async () => {
  const lien = await lienOf(client, RELEASED)
  assert.equal(typeof lien.advanceUsdc6, 'bigint')
  assert.equal(typeof lien.createdAt, 'bigint')
  assert.equal(typeof lien.expiresAt, 'bigint')
  assert.equal(typeof lien.rateBps, 'number')
  assert.equal(typeof lien.status, 'number')
})

// The client advertises that two endpoints are asked so that lying takes two operators. That is
// worth nothing if the lien reads quietly use the first endpoint only — a hostile node could lie
// about a lien while answering the identity check honestly. Pointing one endpoint at a chain that
// is not Arc is the cheapest real disagreement there is: if the read consulted only the first, it
// would succeed.
test('the lien reads honour the quorum, not just the identity check', async () => {
  const split = createCaplaneClient({
    rpcUrls: ['https://rpc.testnet.arc.io', 'https://ethereum-rpc.publicnode.com'],
  })
  await assert.rejects(() => statusOf(split, RELEASED))
  await assert.rejects(() => isEncumbered(split, RELEASED))
  await assert.rejects(() => lienOf(split, RELEASED))
})
