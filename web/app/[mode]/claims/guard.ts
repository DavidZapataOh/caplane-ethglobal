import { type CaplaneClient, submitterOf } from 'caplane-sdk'
import type { Address } from 'viem'

/**
 * Refuses a submission that is not this wallet's.
 *
 * The inbox records who sent each submission, and that record — read through the SDK's quorum, so
 * a single hostile endpoint cannot answer it alone — is what decides. Filtering in the page would
 * put the boundary in the rendering code, one mistake away from showing one organization another's
 * history; asking the chain puts it where a mistake cannot reach.
 */
export const assertOwnSubmission = async (
  client: CaplaneClient,
  submissionId: `0x${string}`,
  wallet: Address,
): Promise<void> => {
  const sender = await submitterOf(client, submissionId)
  // Case is not identity: a wallet reports a checksummed address and the contract returns a
  // lowercase one, and refusing on that difference would lock a business out of its own history.
  if (sender.toLowerCase() !== wallet.toLowerCase()) {
    throw new Error('that submission was not sent by this wallet')
  }
}
