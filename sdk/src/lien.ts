import { registryAbi } from '../abi/index.js'
import type { CaplaneClient } from './client.js'

// Re-exported from the frozen copy rather than restated. A second definition of the status codes
// would be a second thing to keep in step with the contract, and the frozen artifacts are the only
// copies this repository checks byte for byte.
export { type Lien, LienStatus, RejectReason } from '../abi/frozen.js'

const call = <T>(client: CaplaneClient, functionName: 'lienOf' | 'statusOf' | 'isEncumbered', lienId: `0x${string}`) =>
  client.agree((endpoint) =>
    endpoint.readContract({ address: client.registry, abi: registryAbi, functionName, args: [lienId] }),
  ) as Promise<T>

/** Every recorded term of one lien: who borrowed, how much, at what rate, until when. */
export const lienOf = (client: CaplaneClient, lienId: `0x${string}`) =>
  call<import('../abi/frozen.js').Lien>(client, 'lienOf', lienId)

/** The raw status byte. 0 none, 1 active, 2 released, 3 defaulted. */
export const statusOf = (client: CaplaneClient, lienId: `0x${string}`) =>
  call<number>(client, 'statusOf', lienId)

/**
 * Encumbered is status exactly Active. Released and Defaulted are terminal and free the receivable;
 * None means there is no such lien. Reading this as `status != 0` calls a settled lien encumbered,
 * which refuses a refinancing the registry deliberately allows.
 *
 * An expired lien nobody released still reads encumbered. The registry never flips a lien on the
 * clock, and this does not pretend otherwise.
 */
export const isEncumbered = (client: CaplaneClient, lienId: `0x${string}`) =>
  call<boolean>(client, 'isEncumbered', lienId)
