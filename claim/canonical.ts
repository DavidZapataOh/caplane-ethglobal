/**
 * NFKC, then case-fold up, then drop everything that is not a letter or a number.
 *
 * `toUpperCase`, never `toLocaleUpperCase`: the latter exists in the enclave but ignores its
 * locale argument, so a Turkish dotted I comes out differently there than in Node — two
 * commitments for one claim, with no error on either side.
 *
 * The `u` flag, never `v`: set notation throws in the enclave and works in Node.
 */
export const canonicalText = (value: string): string =>
  value.normalize('NFKC').toUpperCase().replace(/[^\p{L}\p{N}]/gu, '')

import { ClaimError } from './schema'

const enumerated =
  (component: 'currency' | 'country', width: number) =>
  (value: string): string => {
    const canonical = value.normalize('NFKC').trim().toUpperCase()
    if (!new RegExp(`^[A-Z]{${width}}$`).test(canonical)) {
      throw new ClaimError(component, `expected ${width} letters`)
    }
    return canonical
  }

export const canonicalCurrency = enumerated('currency', 3)
export const canonicalCountry = enumerated('country', 2)

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
const daysIn = (y: number, m: number) =>
  m === 2 ? (isLeap(y) ? 29 : 28) : m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31

const assemble = (y: number, m: number, d: number): string => {
  if (m < 1 || m > 12 || d < 1 || d > daysIn(y, m)) {
    throw new ClaimError('dueDate', 'no such date')
  }
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * ISO 8601 always; day-first only when the day cannot be a month. Anything ambiguous is
 * refused, because guessing produces a different component in silence.
 *
 * No `Date`: the determinism validator flags it, and its parsing of slash dates is
 * runtime-dependent — the precise ambiguity this refuses.
 */
export const canonicalDate = (value: string): string => {
  const text = value.normalize('NFKC').trim()

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (iso) return assemble(Number(iso[1]!), Number(iso[2]!), Number(iso[3]!))

  const slashed = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text)
  if (slashed) {
    const day = Number(slashed[1]!)
    if (day <= 12) {
      throw new ClaimError('dueDate', 'ambiguous date: use ISO 8601')
    }
    return assemble(Number(slashed[3]!), Number(slashed[2]!), day)
  }

  throw new ClaimError('dueDate', 'unparseable date')
}

/** ISO 4217 exponents that are not 2. Only the one that has a test lives here. */
/**
 * ISO 4217 minor-unit exponents that are not 2. Exported because the enclave compares the ledger's
 * amount against the claim's minor units and must scale by the same figure — hardcoding 100 in a
 * second place is how the two drift, and a JPY claim then fails to match an invoice the ledger
 * really holds.
 */
export const EXPONENT: Record<string, number> = { JPY: 0 }

/**
 * A doubling bucket, not the amount. One real invoice has two defensible amounts — its net
 * line and its taxed total — so an exact amount would keep two honest lenders from matching on
 * the same document. The costs, stated rather than hidden: amounts either side of a power of
 * two never match however close they are, and one bucket is wide enough to hold unrelated
 * claims. Both are measured, not argued.
 *
 * BigInt throughout: a minor-unit amount can exceed Number.MAX_SAFE_INTEGER.
 */
export const canonicalAmountBucket = (amount: string, currency: string): string => {
  const code = canonicalCurrency(currency)
  const text = amount.normalize('NFKC').trim().replace(/[\s,_]/g, '')

  const decimal = /^(\d+)\.(\d+)$/.exec(text)
  let minor: bigint
  if (decimal) {
    const exponent = EXPONENT[code] ?? 2
    const fraction = decimal[2]!
    if (fraction.length !== exponent) {
      throw new ClaimError('amountBucket', `${code} has ${exponent} minor digits`)
    }
    minor = BigInt(decimal[1]! + fraction)
  } else if (/^\d+$/.test(text)) {
    minor = BigInt(text)
  } else {
    throw new ClaimError('amountBucket', 'unparseable amount')
  }

  if (minor <= 0n) throw new ClaimError('amountBucket', 'amount must be positive')

  // floor(log2) without Math.log2: exact on BigInt, and free of floating point entirely.
  let bucket = 0
  for (let n = minor >> 1n; n > 0n; n >>= 1n) bucket++
  return String(bucket)
}
