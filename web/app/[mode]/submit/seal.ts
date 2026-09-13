import { type Hex, hexToBytes } from 'viem'
import type { DebtorConfirmation } from '../../../../claim/attestation'
import { seal } from '../../../../claim/envelope'
import { ClaimType } from '../../../../claim/abi/frozen'
import type { ClaimInput } from '../../../../claim/index'

/**
 * The plaintext the enclave decodes is not the claim alone: its decoder requires the debtor's
 * confirmation and signature inside it, because collecting them before submission is what removes
 * the second execution the workflow would otherwise need.
 *
 * Three of the seven claim fields are overwritten by the enclave from the real ledger. This still
 * sends its best-known values for them — the decoder's type check requires a string in all seven,
 * and an empty one would pass that check and fail later with a message that explains nothing.
 */
export const buildEnvelope = (
  claim: ClaimInput,
  confirmation: DebtorConfirmation,
  signature: Hex,
  authorizedSubmitter: Hex,
  enclavePublicKey: Hex,
): Uint8Array => {
  const plaintext = {
    ...claim,
    confirmation: {
      ...confirmation,
      amountMinor: confirmation.amountMinor.toString(),
      expiresAtBlock: confirmation.expiresAtBlock.toString(),
    },
    signature,
    claimType: ClaimType.Invoice,
  }
  return seal(
    new TextEncoder().encode(JSON.stringify(plaintext)),
    hexToBytes(enclavePublicKey),
    hexToBytes(authorizedSubmitter),
  )
}
