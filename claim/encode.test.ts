import { expect, test } from 'bun:test'
import { DOMAIN, encodeComponentPreimage, encodeTuplePreimage } from './encode'

// A commitment valid at two indices would corrupt the count the threshold is compared against.
// With a one-byte index that is not expressible; with a text index it becomes so at N >= 12,
// which is exactly where the promise that an eighth component can be appended lives.
test('a component cannot be valid at two indices', () => {
  const one = encodeComponentPreimage(1, 1, '224')
  const two = encodeComponentPreimage(1, 2, '24')
  expect(Buffer.from(one).toString('hex')).not.toBe(Buffer.from(two).toString('hex'))
})

test('the tuple preimage is three bytes plus seven digests', () => {
  const digests = Array.from({ length: 7 }, () => new Uint8Array(32))
  expect(encodeTuplePreimage(1, digests)).toHaveLength(3 + 7 * 32)
})

test('every scalar occupies exactly one byte', () => {
  const p = encodeComponentPreimage(1, 6, 'AU')
  expect(p[0]).toBe(DOMAIN.digest)
  expect(p[1]).toBe(1) // version
  expect(p[2]).toBe(1) // claim type
  expect(p[3]).toBe(6) // index
})

// Without the domain byte the three preimage spaces share a shape, and a digest preimage can
// equal a commitment preimage whenever one component happens to end in the pepper's bytes.
test('the three preimage spaces are separated by their first byte', () => {
  const digest = encodeComponentPreimage(1, 0, 'X')
  const commitment = encodeComponentPreimage(1, 0, 'X', new Uint8Array(32))
  expect(digest[0]).not.toBe(commitment[0])
  expect(encodeTuplePreimage(1, [])[0]).not.toBe(digest[0])
})

test('a claim type out of one byte is refused', () => {
  expect(() => encodeComponentPreimage(256, 0, 'X')).toThrow(/single byte/)
})

test('a pepper of the wrong length is refused', () => {
  expect(() => encodeComponentPreimage(1, 0, 'X', new Uint8Array(16))).toThrow(/32 bytes/)
})
