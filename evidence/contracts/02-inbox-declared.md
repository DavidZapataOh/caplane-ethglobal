# For the README's declared limitations

## The submission is public, and only the claim is secret

The envelope sits in public calldata from the moment it is broadcast. Confidentiality rests on
the enclave key and on nothing else: not on transaction privacy, not on the mempool. "No service
can read the claim" is a statement about services, not about observers, and it is true — an
observer sees a sealed blob, a sender address and a length.

Two things follow, and both are consequences of the design rather than defects in it.

A third party can copy an envelope verbatim and submit it from their own address. The derived id
differs, so the contract sees two distinct submissions. The copier cannot read the claim, but
they obtain the collision verdict for a claim that is not theirs. Closing this requires the
plaintext to name the address entitled to submit it, so the enclave can compare that against the
event's submitter; it is a property of the envelope schema and of the workflow, not of this
contract, which cannot distinguish a copy from an original without ceasing to be confidential.

An undecryptable submission cannot be refused on chain either, for the same reason. It costs the
sender a fee and the system one workflow execution.

## Anyone can make the queue longer, and nobody can make it stop

Submission is permissionless by design. The log trigger accepts ten events every six seconds and
queues the rest rather than dropping them, so a flood delays honest submissions instead of
losing them. The cheapest valid submission is 46,983 gas measured from a receipt, so sustaining
the trigger's full rate costs 135 dollars a day — a price, not a wall.

The contract cannot raise that price without an owner, a fee or an allowlist, and it has none of
the three by design. What survives a flood untouched is the exact-identity path: `isEncumbered`
and `lienOf` are `view` calls that cost nothing and depend on no queue. That is the guarantee
that can be made, and it is the one made.

## Idempotency is a contract with the client

A resent envelope is refused as a duplicate. Re-encrypting the same claim is not a duplicate:
the nonce and the ephemeral key are fresh, so the bytes and the id both differ. The refusal
therefore protects a client that caches the envelope and resends the same bytes after an
uncertain outcome, and does nothing for a client that re-encrypts. Deciding that two different
envelopes describe the same claim is the enclave's work, not the chain's.

The refusal is not cheap at the cap. A duplicate carrying a 4,096-byte envelope costs 186,980
gas — the same number to the gas as the submission that was accepted — because calldata is
charged whether the frame reverts or not.

## The logs are not the record

Log data is prunable. A full node keeps receipts for about ten thousand blocks, which is roughly
an hour and a half at Arc's block time, after which a query for them returns an empty array
rather than an error. Permanent availability of the ciphertext depends on an archive node or an
external archiver, and this contract can guarantee neither.

What it does guarantee is `submittedAt`: the block in which each submission id was first
accepted, held in contract state, readable by anyone, erased by nothing.
