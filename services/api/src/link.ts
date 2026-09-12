import { createHmac, timingSafeEqual } from 'node:crypto'

export type LinkPayload = {
  claimId: `0x${string}`
  creditor: `0x${string}`
  contactId: string
  invoiceNumber: string
  currency: string
  amountMinor: string
  dueDate: string
  expiresAtBlock: string
  /** Seconds, not milliseconds. Mixed with Date.now() the link lives a thousand times too long. */
  issuedAt: number
}

const TTL_MS = 60 * 60 * 1000
const spent = new Set<string>()

const key = (): string => {
  const value = process.env.LINK_SIGNING_KEY
  if (value === undefined || value.length < 32) throw new Error('LINK_SIGNING_KEY is not set')
  return value
}

const sign = (body: string): string => createHmac('sha256', key()).update(body).digest('base64url')

/**
 * A one-time link with no store behind it.
 *
 * Everything the signing page needs travels inside the token, authenticated — except the address it
 * was sent to, which is never in here. If the address travelled, anyone the link was forwarded to
 * would learn it, and the service could be handed one instead of resolving it from the ledger,
 * which is the anchor the whole channel rests on.
 *
 * No store, because this process has none and provisioning one would bring a new credential onto
 * the platform surface this service exists to keep narrow.
 */
export const mint = (payload: LinkPayload): string => {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${sign(body)}`
}

export const open = (token: string, now = Date.now()): LinkPayload | undefined => {
  const [body, mac] = token.split('.')
  if (body === undefined || mac === undefined || body === '' || mac === '') return undefined
  const expected = Buffer.from(sign(body))
  const given = Buffer.from(mac)
  // Length first, because timingSafeEqual throws on a mismatch — and a throw here is a 500 that
  // tells whoever is guessing that their guess was the wrong size.
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return undefined
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as LinkPayload
    return now - payload.issuedAt * 1000 > TTL_MS ? undefined : payload
  } catch {
    return undefined
  }
}

/**
 * What the submitter keeps. Derived from the token under the same key, so it needs no store either,
 * and it is not the token: holding a receipt reads a signature back, it does not produce one.
 */
export const receiptOf = (token: string): string => sign(token).slice(0, 32)

/**
 * One use.
 *
 * The set lives in memory, so a platform restart lets an already-signed link be signed again. What
 * that permits is the same debtor signing the same structure, bound to the same creditor, the same
 * claim, the same amounts and the same block height — noise, not theft, and the expiry bounds it.
 * Declared rather than papered over, because the alternative is a store.
 */
export const markUsed = (token: string): boolean => {
  if (spent.has(token)) return false
  spent.add(token)
  return true
}
