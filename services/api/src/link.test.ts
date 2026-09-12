import assert from 'node:assert/strict'
import { test } from 'node:test'
import { type LinkPayload, markUsed, mint, open, receiptOf } from './link.js'

// issuedAt is taken from the clock rather than written: a fixed second would put the fixture
// outside the link's own lifetime the hour after it was typed, and the test would start failing on
// a calendar rather than on a change.
const PAYLOAD: LinkPayload = {
  claimId: '0xf6ef8ca5000000000000000000000000000000000000000000000000000000aa',
  creditor: '0x86Ec9f04485Db066CF155353f15eef356Ae90253',
  contactId: '3e776c4b-ea9e-4bb1-96be-6b0c7a71a37f',
  invoiceNumber: 'ORC1043',
  currency: 'USD',
  amountMinor: '27500000',
  dueDate: '2027-01-30',
  expiresAtBlock: '61700000',
  issuedAt: Math.floor(Date.now() / 1000),
}

test('a minted link opens to what went in', () => {
  assert.deepEqual(open(mint(PAYLOAD)), PAYLOAD)
})

// The token is the only authority the signing page has. A forged one has to be worth nothing, and
// an implementation that merely base64-decoded would pass every other test in this file.
test('a tampered link does not open', () => {
  const token = mint(PAYLOAD)
  const body = token.split('.')[0]!
  assert.equal(open(`${body}.${'A'.repeat(43)}`), undefined)
  const flipped = `${body.slice(0, -1)}${body.slice(-1) === 'A' ? 'B' : 'A'}.${token.split('.')[1]}`
  assert.equal(open(flipped), undefined)
  assert.equal(open('nonsense'), undefined)
  assert.equal(open(body), undefined)
})

// Two clocks: the link expires in time, the signed structure expires in blocks. Both have to bite.
test('an expired link does not open', () => {
  const token = mint({ ...PAYLOAD, issuedAt: 1_000_000 })
  assert.equal(open(token, 1_000_000_000 + 60 * 60 * 1000 + 1), undefined)
  assert.notEqual(open(token, 1_000_000_000 + 1), undefined)
})

// And one against the real clock, because every assertion above hands `open` a time of its own.
test('a link minted now is open now and shut in two hours', () => {
  const token = mint(PAYLOAD)
  assert.notEqual(open(token), undefined)
  assert.equal(open(token, Date.now() + 2 * 60 * 60 * 1000), undefined)
})

// issuedAt is seconds and Date.now() is milliseconds. Mixed, the expiry is a thousand times longer
// than intended and no happy-path test sees it.
test('the expiry is measured in the same unit it was written in', () => {
  const oneHour = 60 * 60 * 1000
  const issuedAt = 1_789_195_000
  assert.notEqual(open(mint({ ...PAYLOAD, issuedAt }), issuedAt * 1000 + oneHour - 1), undefined)
  assert.equal(open(mint({ ...PAYLOAD, issuedAt }), issuedAt * 1000 + oneHour + 1), undefined)
})

// One use. The set is in memory, and what that costs on a restart is declared rather than hidden.
test('a link is spent once', () => {
  const token = mint(PAYLOAD)
  assert.equal(markUsed(token), true)
  assert.equal(markUsed(token), false)
  assert.equal(markUsed(mint({ ...PAYLOAD, invoiceNumber: 'ORC1044' })), true)
})

// No address, ever. If the email travelled inside the token, whoever forwarded the link would learn
// it — and worse, the service could be talked into carrying one it was handed.
test('the link carries no address', () => {
  const body = Buffer.from(mint(PAYLOAD).split('.')[0]!, 'base64url').toString()
  assert.equal(/@/.test(body), false)
  assert.equal(/email|mail/i.test(body), false)
})

// The receipt is what the submitter keeps. It has to be derivable from the token without a store,
// and it must not be the token — whoever holds the receipt can read the signature, not produce it.
test('the receipt derives from the token and is not the token', () => {
  const token = mint(PAYLOAD)
  assert.equal(receiptOf(token), receiptOf(token))
  assert.notEqual(receiptOf(token), token)
  assert.equal(receiptOf(token).length, 32)
  assert.notEqual(receiptOf(token), receiptOf(mint({ ...PAYLOAD, invoiceNumber: 'ORC1044' })))
})
