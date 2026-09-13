import { PrivyClient } from '@privy-io/node'

const required = (name: string): string => {
  const value = process.env[name]
  if (value === undefined || value === '') throw new Error(`missing environment variable: ${name}`)
  return value
}

let instance: PrivyClient | undefined

/**
 * The server side of the integration: the app secret lives here and never reaches a browser.
 *
 * One client for the lifetime of the process, built on first use rather than at import so a build
 * without credentials still compiles. The client caches the app's JWT verification key, so a fresh
 * one per request would re-fetch it from Privy on every call that verifies an access token.
 */
export const privyClient = (): PrivyClient =>
  (instance ??= new PrivyClient({
    appId: required('NEXT_PUBLIC_PRIVY_PUBLIC_APP'),
    appSecret: required('PRIVY_SERVER_CREDENTIAL'),
  }))

const SCHEME = 'Bearer '

/**
 * Privy sessions are held in local storage, so the access token arrives as a bearer header rather
 * than a cookie. Kept as a pure function of the request so it can be tested without a network.
 */
export const bearerToken = (request: Request): string | undefined => {
  const header = request.headers.get('authorization')
  if (header === null || !header.startsWith(SCHEME)) return undefined
  const token = header.slice(SCHEME.length)
  return token === '' ? undefined : token
}

/**
 * The Privy user ID of the caller, or `undefined` if the request does not carry a token Privy
 * issued for this app. Both routes here act on an organization's wallet, so an unauthenticated
 * caller would be asking the app secret to create Privy resources, or to sign, on nobody's behalf.
 */
export const authenticatedUserId = async (
  privy: PrivyClient,
  request: Request,
): Promise<string | undefined> => {
  const token = bearerToken(request)
  if (token === undefined) return undefined
  try {
    return (await privy.utils().auth().verifyAccessToken(token)).user_id
  } catch {
    return undefined
  }
}
