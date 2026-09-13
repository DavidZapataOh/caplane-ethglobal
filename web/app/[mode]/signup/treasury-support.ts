import { isPolicyViolation } from '../../api/organizations/policy.ts'

export const validOrgName = (name: string): boolean => name.trim().length > 0

/**
 * A decimal amount as typed into a field, in wei. Arc's native asset is USDC at 18 decimals.
 * Truncates past the eighteenth place rather than rounding: rounding up could push an amount the
 * visitor typed under the threshold to one at it, and have the policy refuse something they never
 * asked for.
 */
export const weiOf = (decimalAmount: string): bigint => {
  const [whole = '0', fraction = ''] = decimalAmount.trim().split('.')
  return (
    BigInt(whole === '' ? '0' : whole) * 10n ** 18n +
    BigInt(`${fraction}${'0'.repeat(18)}`.slice(0, 18))
  )
}

/**
 * What the visitor is told. Only a refusal the policy actually issued is reported as one: calling
 * an empty wallet a policy block would tell a business its treasury rule works when it was never
 * consulted.
 */
export const messageFor = (e: { status?: number; error?: { code?: string } }): string =>
  isPolicyViolation(e)
    ? 'Blocked by treasury policy: this transfer is at or above the approval threshold.'
    : 'The transfer could not be completed.'

export type Outcome = { kind: 'sent' | 'blocked' | 'error'; detail: string }

/**
 * What the page shows for each way a transfer ends. Three outcomes, told apart by which layer
 * refused: the policy, the chain, or nothing at all.
 *
 * A signed transaction is not an outcome a business cares about — it is an intermediate artifact.
 * What lands is a hash, which is why a successful transfer reports one.
 */
export const outcomeOf = (body: {
  hash?: string
  rpcError?: string
  status?: number
  error?: { code?: string }
  blockedByPolicy?: boolean
}): Outcome => {
  if (body.hash !== undefined) return { kind: 'sent', detail: body.hash }
  if (body.blockedByPolicy === true || isPolicyViolation(body)) {
    return { kind: 'blocked', detail: messageFor(body) }
  }
  if (body.rpcError !== undefined) return { kind: 'error', detail: body.rpcError }
  return { kind: 'error', detail: messageFor(body) }
}
