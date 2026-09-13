import type { Pair } from './contrast'

/**
 * The hint and error line under an input. Never the seal: a malformed amount is a process error,
 * and the brand reserves that colour for a claim taken on something.
 */
export const FIELD_HINT_PAIR: Pair = { fg: '--cp-text-2', bg: '--cp-ground' }

/** Derived from the input's own id, so two fields on one page cannot point at the same message. */
export const describedById = (id: string, hasMessage = true): string | undefined =>
  hasMessage ? `${id}-message` : undefined
