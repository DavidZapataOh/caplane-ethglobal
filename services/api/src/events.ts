import { decodeEventLog, parseAbiItem, toEventSelector } from 'viem'
import type { AbiEvent, Hex } from 'viem'
import { RejectReason } from '../abi/frozen.js'
import type { Log } from './rpc.js'

/**
 * CaplanePool is an ERC4626, so these four are emitted by a contract of ours and declared in none of
 * its source files. Measured: they are four of the seventeen logs the registry's lifetime holds — a
 * quarter of the feed. A watcher assembled from contracts/src alone loses them silently.
 */
const INHERITED = [
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
  'event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)',
  'event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)',
] as const

/**
 * The signatures are the only source here, for selectors and for decoding alike. The generated ABI
 * carries the registry and the inbox and not the pool or the escrow, and regenerating it would edit
 * four byte-identical copies, one of which compiles into the enclave's WASM.
 */
const SIGNATURES = [
  'event ClaimSubmitted(bytes32 indexed submissionId, address indexed submitter, bytes ciphertext)',
  'event LienRecorded(bytes32 indexed lienId, address indexed borrower, uint64 expiresAt)',
  'event LienReleased(bytes32 indexed lienId)',
  'event LienDefaulted(bytes32 indexed lienId)',
  'event SubmissionRejected(bytes32 indexed submissionId, uint8 reasonCode)',
  'event Disbursed(bytes32 indexed lienId, address indexed borrower, uint256 amount)',
  'event Repaid(bytes32 indexed lienId, address indexed payer, uint256 amount)',
  'event WrittenDown(bytes32 indexed lienId, uint256 principal)',
  'event Paid(bytes32 indexed lienId, address indexed payer, uint256 amount)',
  'event Settled(bytes32 indexed lienId, uint256 toPool, uint256 toBorrower)',
  'event Refunded(bytes32 indexed lienId, address indexed payer, uint256 amount)',
  ...INHERITED,
] as const

export type WatchedEvent = { name: string; signature: string; topic0: Hex; item: AbiEvent }

export const WATCHED: readonly WatchedEvent[] = SIGNATURES.map((signature) => {
  const item = parseAbiItem(signature) as AbiEvent
  return { name: item.name, signature, topic0: toEventSelector(signature), item }
})

const REASONS = Object.entries(RejectReason) as Array<[string, number]>

export type ActivityEvent = {
  name: string
  address: Hex
  blockNumber: string
  logIndex: number
  transactionHash: Hex
  fields: Record<string, string>
  reason?: string
}

export const decode = (log: Log): ActivityEvent | undefined => {
  const topic = log.topics[0]
  const watched = WATCHED.find((event) => event.topic0 === topic)
  if (watched === undefined) return undefined
  try {
    const { args } = decodeEventLog({
      abi: [watched.item],
      // Not point-free: Array.map hands the index to viem's second parameter and the call stops
      // typechecking.
      topics: log.topics as [Hex, ...Hex[]],
      data: log.data,
    })
    const fields = Object.fromEntries(
      // Decimal text on purpose: JSON has no bigint, and a Number would lose an advance above 2^53
      // without reporting it.
      Object.entries((args ?? {}) as Record<string, unknown>).map(([key, value]) => [key, String(value)]),
    )
    const code = fields.reasonCode
    const reason = code === undefined ? undefined : REASONS.find(([, value]) => value === Number(code))?.[0]
    return {
      name: watched.name,
      address: log.address,
      blockNumber: BigInt(log.blockNumber).toString(),
      logIndex: Number(log.logIndex),
      transactionHash: log.transactionHash,
      fields,
      ...(reason === undefined ? {} : { reason }),
    }
  } catch {
    return undefined
  }
}
