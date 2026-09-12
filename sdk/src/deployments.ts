import book from '../abi/deployments.arc-testnet.json' with { type: 'json' }

export type Deployments = {
  registry: `0x${string}`
  inbox: `0x${string}`
  pool: `0x${string}`
  escrow: `0x${string}`
  forwarder: `0x${string}`
  chainSelector: bigint
  workflowOwner: `0x${string}`
  workflowName: `0x${string}`
  blockNumber: bigint
}

/**
 * The address book, read rather than retyped. These addresses are not frozen: they changed once
 * already, and a hand-copied constant would have gone stale that day.
 *
 * `chainSelector` is a decimal string in the record because it exceeds Number.MAX_SAFE_INTEGER —
 * `Number()` of it is 3034092155422582000, a different identifier that would be accepted in
 * silence — and it leaves here as a bigint so a caller cannot undo that.
 */
export const deployments: Deployments = {
  registry: book.registry as `0x${string}`,
  inbox: book.inbox as `0x${string}`,
  pool: book.pool as `0x${string}`,
  escrow: book.escrow as `0x${string}`,
  forwarder: book.forwarder as `0x${string}`,
  chainSelector: BigInt(book.chainSelector),
  workflowOwner: book.workflowOwner as `0x${string}`,
  workflowName: book.workflowName as `0x${string}`,
  blockNumber: BigInt(book.blockNumber),
}
