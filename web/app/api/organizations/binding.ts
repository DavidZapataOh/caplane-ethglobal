import { createHmac, timingSafeEqual } from 'node:crypto'

export type Binding = { userId: string; walletId: string }

/**
 * Which wallet a signed-in visitor is allowed to spend from.
 *
 * Verifying the access token proves someone is signed in; it does not prove which organization is
 * theirs. Privy's organization resource carries no membership — an organization is an id, a name
 * and a key quorum — so the server cannot ask it whether this caller owns that wallet. Left there,
 * any signed-in visitor could name another organization's wallet id and have the app secret sign
 * for them, capped only by that organization's own threshold.
 *
 * So the wallet id stops being caller input. It travels inside a token this server mints at
 * sign-up and authenticates on the way back, and the transfer route reads the id out of the token
 * rather than out of the request body. Stateless, for the same reason the debtor's link is: this
 * surface has no store, and provisioning one to hold a mapping the token already carries would add
 * a credential to a platform that does not need it.
 */
const sign = (body: string, key: string): string =>
  createHmac('sha256', key).update(body).digest('base64url')

export const bindWallet = (binding: Binding, key: string): string => {
  const body = Buffer.from(JSON.stringify(binding)).toString('base64url')
  return `${body}.${sign(body, key)}`
}

export const openBinding = (token: string, key: string): Binding | undefined => {
  const [body, mac] = token.split('.')
  if (body === undefined || mac === undefined || body === '' || mac === '') return undefined

  const expected = Buffer.from(sign(body, key))
  const given = Buffer.from(mac)
  // Length first: `timingSafeEqual` throws on a mismatch rather than returning false.
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return undefined

  try {
    const binding = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Binding
    return typeof binding.userId === 'string' && typeof binding.walletId === 'string'
      ? binding
      : undefined
  } catch {
    return undefined
  }
}
