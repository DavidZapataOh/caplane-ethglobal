import book from '../abi/deployments.arc-testnet.json' with { type: 'json' }

/**
 * The structure the debtor signs, restated.
 *
 * It is not imported: the package that owns it ships raw TypeScript with its own runtime
 * dependencies and no build step, so there is nothing here to consume. What restating costs is
 * drift, and drift in this direction is the expensive one — this service would accept a signature
 * the enclave then refuses, turning a channel fault into a refusal on chain that costs gas and
 * reads as the debtor saying no. A test pins this copy to the original, field for field.
 */
export const CONFIRMATION_TYPES = {
  DebtorConfirmation: [
    { name: 'creditor', type: 'address' },
    { name: 'debtor', type: 'address' },
    { name: 'claimId', type: 'bytes32' },
    { name: 'invoiceNumber', type: 'string' },
    { name: 'currency', type: 'string' },
    { name: 'amountMinor', type: 'uint256' },
    { name: 'dueDate', type: 'string' },
    { name: 'debtorRef', type: 'bytes32' },
    { name: 'expiresAtBlock', type: 'uint64' },
  ],
} as const

/** The six fields a debtor is shown before signing. Amounts and identifiers, no chrome. */
export const SHOWN = [
  'creditor',
  'invoiceNumber',
  'currency',
  'amountMinor',
  'dueDate',
  'expiresAtBlock',
] as const

/**
 * Domain separation, not a verifier: nothing on chain checks this signature. What the verifying
 * contract stops is a confirmation signed against one deployment meaning anything against another.
 */
export const confirmationDomain = (registry: `0x${string}`) =>
  ({
    name: 'Caplane',
    version: '1',
    chainId: book.chainId,
    verifyingContract: registry,
  }) as const
