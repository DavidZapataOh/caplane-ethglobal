import { expect, test } from 'bun:test'
import { canonicalText } from './canonical'

test('strips separators so the same identifier written two ways agrees', () => {
  // Both spellings are real: the seeded corpus stores the tax number with spaces and its
  // variant strips them, in that direction, because that is how the source system holds it.
  expect(canonicalText('11 000 111 000')).toBe(canonicalText('11000111000'))
  expect(canonicalText('ORC-1043')).toBe(canonicalText('orc 1043'))
})

test('folds compatibility characters before casing', () => {
  expect(canonicalText('Ａ１')).toBe('A1')
  expect(canonicalText('ﬁ')).toBe('FI')
})

// The locale trap. toLocaleUpperCase returns İSTANBUL in Node and ISTANBUL in the enclave:
// two commitments for one invoice, and nothing warns.
test('uppercases without a locale, so both runtimes agree', () => {
  expect(canonicalText('istanbul')).toBe('ISTANBUL')
})

test('keeps letters and digits from any script', () => {
  expect(canonicalText('ACMÉ Corp 123')).toBe('ACMÉCORP123')
})

test('an identifier that is only punctuation canonicalises to nothing', () => {
  expect(canonicalText('---')).toBe('')
})

import { canonicalCountry, canonicalCurrency, canonicalDate } from './canonical'
import { ClaimError } from './schema'

test('a currency is three letters, uppercased', () => {
  expect(canonicalCurrency(' aud ')).toBe('AUD')
})

test('a currency that is not three letters is refused, not accepted as text', () => {
  expect(() => canonicalCurrency('AUDD')).toThrow(ClaimError)
})

test('a country is two letters, uppercased', () => {
  expect(canonicalCountry('au')).toBe('AU')
})

test('an ISO date passes through', () => {
  expect(canonicalDate('2026-12-31')).toBe('2026-12-31')
})

test('a day-first date is accepted when the day cannot be a month', () => {
  expect(canonicalDate('31/12/2026')).toBe('2026-12-31')
})

// Guessing would produce a different component in silence, and a registry cannot report a
// different answer to two askers.
test('an ambiguous date is refused rather than guessed', () => {
  expect(() => canonicalDate('01/12/2026')).toThrow(/ambiguous/)
})

test('a date that does not exist is refused', () => {
  expect(() => canonicalDate('2026-02-30')).toThrow(ClaimError)
})

test('a leap day is accepted in a leap year and refused otherwise', () => {
  expect(canonicalDate('2028-02-29')).toBe('2028-02-29')
  expect(() => canonicalDate('2026-02-29')).toThrow(ClaimError)
})

import { canonicalAmountBucket } from './canonical'

// The two amounts of one real invoice: the line is 250,000.00 and 275,000.00 is owed.
test('the net line and the taxed total of one real invoice share a bucket', () => {
  expect(canonicalAmountBucket('25000000', 'AUD')).toBe(canonicalAmountBucket('27500000', 'AUD'))
})

test('minor units and major units with a separator are the same amount', () => {
  expect(canonicalAmountBucket('275000.00', 'AUD')).toBe(canonicalAmountBucket('27500000', 'AUD'))
})

test('an order of magnitude apart lands in different buckets', () => {
  expect(canonicalAmountBucket('50000000', 'AUD')).not.toBe(canonicalAmountBucket('25000000', 'AUD'))
})

// A zero-exponent currency has no minor units, so decimals are a malformed amount rather than
// a different spelling of the same one.
test('a currency with no minor unit refuses a decimal amount', () => {
  expect(() => canonicalAmountBucket('1000.00', 'JPY')).toThrow(ClaimError)
  expect(canonicalAmountBucket('1000', 'JPY')).toBe('9')
})

test('a non-positive amount is refused', () => {
  expect(() => canonicalAmountBucket('0', 'AUD')).toThrow(ClaimError)
})

test('separators in the integer part do not change the amount', () => {
  expect(canonicalAmountBucket('27,500,000', 'AUD')).toBe(canonicalAmountBucket('27500000', 'AUD'))
})

test('an amount past the safe integer range still buckets exactly', () => {
  expect(canonicalAmountBucket('9007199254740993', 'AUD')).toBe('53')
})

// A ClaimError's message becomes the execution failure reason, and that crosses out of the enclave
// to the DON. Interpolating the offending value published the submitter's exact amount, due date
// or currency to node operators — the parties the sealed envelope exists to defend against. The
// component name is kept, because it is a fixed vocabulary; the value is not.
test('a claim error names the component and never the value', () => {
  const secrets = ['27500000.5', '31/12/2026', 'AUDD', 'Bayside Club Ltd', '!!!']
  for (const value of secrets) {
    for (const build of [
      () => canonicalCurrency(value),
      () => canonicalCountry(value),
      () => canonicalDate(value),
      () => canonicalAmountBucket(value, 'AUD'),
    ]) {
      try {
        build()
      } catch (error) {
        expect((error as Error).message).not.toContain(value)
      }
    }
  }
})
