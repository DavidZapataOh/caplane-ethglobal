import { ClaimType, COMMITMENT } from './abi/frozen'

const PEPPER_BYTES = 32

/**
 * The three preimage spaces, separated by their first byte. Without this a digest preimage can
 * equal a commitment preimage whenever a component happens to end in the pepper's bytes — today
 * unreachable only because canonical text is letters and digits and the pepper is random binary,
 * which is a property of the inputs rather than of the construction. One byte makes it a
 * property of the construction.
 */
export const DOMAIN = { digest: 1, commitment: 2, tuple: 3 } as const

const byte = (name: string, value: number): number => {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new RangeError(`${name} must fit in a single byte, got ${value}`)
  }
  return value
}

const concat = (parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/**
 * One byte each for domain, version, claim type and index; the component as UTF-8; the pepper,
 * when present, as exactly thirty-two bytes.
 *
 * Fixed widths are the whole point. The frozen formula writes concatenation as a bar and never
 * says what that means, and the obvious reading — join the strings — collides on data this
 * project already holds: a character shifted from one variable field into the next produces
 * identical bytes. Every scalar here is one byte and the single variable field sits between a
 * known prefix and a known-length suffix, so no shift can survive.
 */
export const encodeComponentPreimage = (
  claimType: number,
  index: number,
  component: string,
  pepper?: Uint8Array,
): Uint8Array => {
  if (pepper && pepper.length !== PEPPER_BYTES) {
    throw new RangeError(`pepper must be ${PEPPER_BYTES} bytes, got ${pepper.length}`)
  }
  return concat([
    Uint8Array.of(
      pepper ? DOMAIN.commitment : DOMAIN.digest,
      byte('version', COMMITMENT.version),
      byte('claim type', claimType),
      byte('index', index),
    ),
    new TextEncoder().encode(component),
    ...(pepper ? [pepper] : []),
  ])
}

/**
 * The tuple is seven digests, not seven strings. A digest is thirty-two bytes always, so the
 * boundaries stop depending on the content and a shifted character stops being expressible.
 */
export const encodeTuplePreimage = (claimType: number, digests: readonly Uint8Array[]): Uint8Array =>
  concat([
    Uint8Array.of(DOMAIN.tuple, byte('version', COMMITMENT.version), byte('claim type', claimType)),
    ...digests,
  ])

export { ClaimType }
