import { createPublicClient, http, type Address, type PublicClient } from 'viem'
import { arcTestnet } from './chain.js'
import { deployments } from './deployments.js'

/**
 * `WORKFLOW_NAME()`. Written literally because it is not in the ABI: the getter is an immutable the
 * generator never emitted, so there is nothing to import and nothing to derive.
 */
const IDENTITY_SELECTOR = '0x007271ce' as const

const stable = (value: unknown) =>
  JSON.stringify(value, (_key, inner) => (typeof inner === 'bigint' ? `${inner}n` : inner))

export type CaplaneClient = {
  endpoints: readonly string[]
  registry: Address
  read: PublicClient
  /**
   * Asks every configured endpoint and refuses a disagreement. Exposed because the reads live in
   * their own modules: if they used `read` directly, a hostile endpoint could lie about a lien
   * while answering the identity check honestly, and the quorum would protect the one question
   * nobody was going to be defrauded over.
   */
  agree: <T>(ask: (client: PublicClient) => Promise<T>) => Promise<T>
  registryCode: () => Promise<`0x${string}`>
  workflowName: () => Promise<`0x${string}`>
}

/**
 * A reader over the Caplane registry.
 *
 * The endpoint is the caller's. Two are asked by default and their answers compared, which does not
 * make the read trustless: this chain has no light client, so a node can always lie. What two
 * endpoints buy is that lying takes two operators agreeing — a cost, not a proof. A caller running
 * their own node should pass it and set `quorum: false`.
 */
export const createCaplaneClient = (
  options: { rpcUrls?: readonly string[]; registry?: Address; quorum?: boolean } = {},
): CaplaneClient => {
  const endpoints = options.rpcUrls ?? arcTestnet.rpcUrls.default.http
  const first = endpoints[0]
  if (first === undefined) throw new Error('no rpc endpoint given')
  const registry = options.registry ?? deployments.registry
  const clients = endpoints.map((url) => createPublicClient({ chain: arcTestnet, transport: http(url) }))
  const quorum = options.quorum ?? endpoints.length > 1

  const agree = async <T>(ask: (client: PublicClient) => Promise<T>): Promise<T> => {
    const [head, ...rest] = await Promise.all(
      (quorum ? clients : clients.slice(0, 1)).map((client) => ask(client as PublicClient)),
    )
    for (const answer of rest) {
      // A replacer, because JSON.stringify throws on a bigint and a lien carries three of them.
      if (stable(answer) !== stable(head)) throw new Error('endpoints disagree about chain state')
    }
    return head as T
  }

  return {
    endpoints,
    registry,
    read: clients[0] as PublicClient,
    agree,
    registryCode: () => agree((client) => client.getCode({ address: registry })).then((code) => code ?? '0x'),
    workflowName: async () => {
      const returned = await agree((client) => client.call({ to: registry, data: IDENTITY_SELECTOR }))
      // A wrong address answers `0x` and so does an address with no code. Both look exactly like a
      // registry that happens to hold nothing, which is why the identity is read and not assumed.
      // `bytes10` comes back left-aligned in a 32-byte word: twenty hex characters, then padding.
      const word = returned.data
      if (word === undefined || word.length < 22) throw new Error('registry identity unreadable')
      return `0x${word.slice(2, 22)}` as `0x${string}`
    },
  }
}
