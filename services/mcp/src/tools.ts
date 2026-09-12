import type { Hex } from 'viem'
import { LienStatus, RejectReason, createCaplaneClient, deployments, liensOf } from '@caplane/sdk'
import { readLien } from './rpc.js'

const HASH = /^0x[0-9a-fA-F]{64}$/
const ADDRESS = /^0x[0-9a-fA-F]{40}$/

const STATUS_NAMES = Object.fromEntries(
  Object.entries(LienStatus).map(([name, value]) => [value, name.toLowerCase()]),
) as Record<number, string>

/**
 * What the server tells an agent before it asks anything. It is the only place in the protocol where
 * a server can say what NOT to ask, and the boundary the pepper created belongs there rather than in
 * a README an agent will never fetch.
 */
export const INSTRUCTIONS = [
  'Read-only access to the Caplane lien registry on Arc Testnet.',
  'Every answer carries a receipt — endpoint, block height, call data and raw result — so it can be',
  'replayed against any node without trusting this server.',
  'A lien id cannot be derived from a receivable: the registry key is salted with a secret that never',
  'leaves the enclave. Ask about a lien id you were given, or enumerate by borrower address.',
  'Encumbered means status is exactly active; a released lien and an id that was never written both',
  'answer false, so read the status rather than the boolean.',
].join(' ')

export type Tool = {
  name: string
  title: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, { type: string; description: string }>
    required?: string[]
    additionalProperties: false
  }
  annotations: { readOnlyHint: true; openWorldHint: true }
}

const lienIdSchema = {
  type: 'object' as const,
  properties: {
    lienId: { type: 'string', description: 'The 32-byte lien id, as 0x-prefixed hex. The enclave issues it; it cannot be derived from a receivable.' },
  },
  required: ['lienId'],
  additionalProperties: false as const,
}

export const TOOLS: readonly Tool[] = [
  {
    name: 'get_lien',
    title: 'Get a lien',
    description:
      'Every recorded term of one lien: who borrowed, how much in USDC base units, at what rate in basis points, when it was recorded and when it expires. Carries a receipt that replays the reads against any node.',
    inputSchema: lienIdSchema,
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: 'is_encumbered',
    title: 'Is a lien active',
    description:
      'Whether a lien is currently active. Released and defaulted are terminal and free the receivable, so this answers false for them and for an id that was never written — read the status it returns alongside rather than the boolean alone.',
    inputSchema: lienIdSchema,
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: 'liens_of_borrower',
    title: 'Liens of a borrower',
    description:
      'Every lien ever recorded for one borrower address, from the registry deployment block. This is the only question answerable without having been handed a lien id: it says how much a counterparty has already pledged and until when.',
    inputSchema: {
      type: 'object',
      properties: {
        borrower: { type: 'string', description: 'The 20-byte borrower address, as 0x-prefixed hex.' },
        fromBlock: { type: 'string', description: 'Optional decimal block height to start from. Defaults to the deployment block.' },
      },
      required: ['borrower'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: 'registry_identity',
    title: 'Registry identity',
    description:
      'The chain, the registry address, the hash of its deployed code, and the workflow name it has frozen as an immutable — so a caller can check it is reading the real registry rather than taking this server’s word for the address.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: 'explain_rejection',
    title: 'Explain a rejection code',
    description:
      'What a SubmissionRejected reason code means. Reads nothing: the codes are fixed in the frozen interface, and the registry emits a bare uint8 with no enum behind it.',
    inputSchema: {
      type: 'object',
      properties: { code: { type: 'number', description: 'The reasonCode from a SubmissionRejected event.' } },
      required: ['code'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
]

export type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: true }

const ok = (value: unknown): ToolResult => ({
  // Amounts and heights as decimal text: JSON has no bigint, and a Number loses an advance above
  // 2^53 without reporting it.
  content: [{ type: 'text', text: JSON.stringify(value, (_key, inner) => (typeof inner === 'bigint' ? inner.toString() : inner), 2) }],
})

/** A tool failure is a result, not a protocol error: an agent told the server is broken stops. */
const failed = (message: string): ToolResult => ({ content: [{ type: 'text', text: message }], isError: true })

export const call = async (name: string, args: Record<string, unknown>): Promise<ToolResult> => {
  if (name === 'explain_rejection') {
    const code = Number(args.code)
    const found = Object.entries(RejectReason).find(([, value]) => value === code)?.[0]
    return ok({ code, reason: found })
  }
  if (name === 'registry_identity') {
    const client = createCaplaneClient()
    const [code, workflowName] = await Promise.all([client.registryCode(), client.workflowName()])
    const { keccak256 } = await import('viem')
    return ok({
      chainId: 5042002,
      registry: deployments.registry,
      codeHash: keccak256(code),
      codeBytes: (code.length - 2) / 2,
      workflowName,
      workflowOwner: deployments.workflowOwner,
      matchesFrozenIdentity: workflowName === deployments.workflowName,
    })
  }
  if (name === 'get_lien' || name === 'is_encumbered') {
    const lienId = String(args.lienId ?? '')
    if (!HASH.test(lienId)) return failed('lienId must be 32 bytes of 0x-prefixed hex')
    const { lien, status, encumbered, receipt } = await readLien(lienId as Hex)
    if (name === 'is_encumbered') {
      return ok({
        lienId,
        encumbered,
        status: STATUS_NAMES[status],
        note: 'encumbered is status exactly active; released, defaulted and never-written all answer false',
        receipt,
      })
    }
    return ok({ lienId, ...lien, status: STATUS_NAMES[status], encumbered, receipt })
  }
  if (name === 'liens_of_borrower') {
    const borrower = String(args.borrower ?? '')
    if (!ADDRESS.test(borrower)) return failed('borrower must be 20 bytes of 0x-prefixed hex')
    const from = args.fromBlock === undefined ? undefined : BigInt(String(args.fromBlock))
    const client = createCaplaneClient()
    const found = await liensOf(client, borrower as Hex, from === undefined ? {} : { fromBlock: from })
    return ok({
      borrower,
      fromBlock: String(from ?? 61_681_981n),
      endpoint: client.endpoints[0],
      note: 'assembled from LienRecorded logs against one endpoint; an endpoint that omitted an event would show less pledged than there is',
      liens: found,
    })
  }
  throw new Error(`unknown tool: ${name}`)
}
