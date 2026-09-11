# Frozen interface

Everything here is fixed. Four workstreams build against it in parallel, so a change is a
four-way break. Selectors and topics are pinned by `contracts/test/FrozenInterface.t.sol`;
vendored copies are pinned by the `hygiene` CI job.

## Two query modes

| Mode | Who can run it | How |
|---|---|---|
| **Exact identity** | Anyone, no account, from a block explorer | `isEncumbered(lienId)`, `lienOf(lienId)` |
| **Fuzzy membership** | Anyone, permissionlessly, by transaction | Submit to `CaplaneInbox`; the enclave matches k-of-N against peppered component commitments via `matchesOf` |

Component commitments are peppered with a Vault secret. Without the pepper the index would be
brute-forceable — currency, country, due date and amount bucket are low-entropy — and the
registry would be a plaintext one. The cost, stated rather than hidden: a third party's fuzzy
query costs gas. Exact-identity lookups stay free and permissionless.

## Identity check, and why it is not the workflow id

`onReport` pins `workflowOwner` and `workflowName`, never `workflowId`.

The workflow id is a content hash over {binary, config, owner, name}: changing one threshold in
`config.production.json` produces a new id. Pinning it in a contract with no setter would force a
registry redeploy on every iteration and orphan every existing lien. Owner and name are stable
across code and config changes, and both are knowable before anything is deployed —
`cre workflow hash -v` prints the org-derived owner, and the name hashes offline from its string.

Chainlink's own `ReceiverTemplate` supports the same triple and enforces at runtime that checking
the name requires checking the author. We do both, and skip the id.

The owner is shared by every workflow in the organization; the name is not. That pairing is what
makes the check precise.

`workflowName` is `bytes10` of the first 10 hex characters of `sha256(name)`, taken as ASCII bytes.

## Receiver rules

- `onReport` reverts unless `msg.sender` is the KeystoneForwarder.
- `metadata` is 64 packed bytes. Slice it; never `abi.decode` it. Validate `length >= 62`,
  never `== 62` — production delivers 64 and an `== 62` guard reverts on every real delivery.
  Verified against `KeystoneForwarder.sol`: `METADATA_LENGTH = 109`,
  `FORWARDER_METADATA_LENGTH = 45`, and the forwarded slice is `rawReport[45:109]`.
- Both `workflowId` (`metadata[0:32]`) and `workflowOwner` (`metadata[42:62]`) are readable;
  we check the owner and the name. The forwarder has no receiver allowlist, so this is the
  entire security boundary.
- `supportsInterface` is `pure` and answers three probes: `0x805f2132` true, `0x01ffc9a7` true,
  `0xffffffff` false. Failing ERC-165 marks the transmission permanently invalid — no retry.
- The report carries `chainSelector` and `nonce` because DON signatures commit to neither.

## Status transitions

`0 none · 1 active · 2 released · 3 defaulted`. Only these transitions are legal, and every one
of them is written by a report:

| From | To | Written by |
|---|---|---|
| none | active | `ReportKind.Record` |
| active | released | `ReportKind.Release`, after repayment |
| active | defaulted | `ReportKind.Default`, after `expiresAt` |

`released` and `defaulted` are terminal: a lien id is never reused, so re-registering a released
commitment reverts `AlreadyEncumbered`. Expiry does **not** silently flip a lien out of `active` —
`isEncumbered` returns `status == 1` and nothing else. An expired-but-unreleased lien still reads
encumbered, which is the safe direction: the alternative lets a post-expiry re-pledge pass.

## Submission envelope

`ClaimSubmitted.ciphertext` is packed in this order: version (1 byte) · algorithm id (1 byte,
`1` = X25519 + XChaCha20-Poly1305) · ephemeral public key (32) · nonce (24) · ciphertext.
Maximum 4,096 bytes total, which keeps the whole event inside the 5,000-byte LogTrigger budget.
That budget is `EventSizeLimit = Size(5 * config.KByte)` and their `KByte` is 1,000, not 1,024.
The 5,120 this file carried until now is `ChainWrite.EVM.ReportSizeLimit`, which really is 5,120
and is a different limit; the two were conflated.
The enclave's public key is published in `deployments.<network>.json`.

## Additive changes to the frozen interface

Adding an error is additive: it changes no existing selector, no event topic and no function
signature. An existing error is reused only when its argument is still true of the new case.

- `WrongComponentCount(uint256 count)` on `ICaplaneRegistry` — a report whose body carries the
  wrong number of component commitments. `BadMetadata` would have named a field that was intact.
- `WrongSubmissionId(bytes32 expected, bytes32 given)` on `ICaplaneInbox` — the id is derived,
  `keccak256(msg.sender ‖ ciphertext)`, and the contract enforces it. Without that check a
  mempool observer burns someone else's id for the price of one transaction. `DuplicateSubmission`
  would have told a caller they had already sent something they never sent.

`CaplaneRegistry`'s constructor takes a fourth argument, `chainSelector`, so a report minted for
another chain cannot be replayed here. Still no id to pin, so the deployment graph is unchanged.

## Budgets

| Limit | Value | Measured |
|---|---|---|
| Report payload | 5,011 bytes (5,120 minus the 109-byte header) | golden vector: **576 bytes** |
| Transaction gas on Arc | 5,000,000 | — |
| `onReport` gas | budget ≤ 4,800,000 | — |
| `ClaimSubmitted` event | 5,000 bytes (LogTrigger) | serialized log at the 4,096-byte cap: **~4,400 bytes** |
| `Lien` storage | 3 slots | reordering saves **24,248 gas** per lien |
| `submit` gas | 275-byte envelope ≤ 60,000 | receipt: **53,935**; at the 4,096-byte cap **186,980**, the EIP-7623 floor exactly |

What the event budget weighs is the whole protobuf `Log` — address, three topics, transaction
hash, block hash, the event signature repeated and the block number, around 239 bytes of
overhead — not the event data alone. A `.gas-snapshot` cannot police `submit`: it is identical
whether or not `foundry.toml` declares `network = "arc"`, and that line is what turns on Arc's
calldata floor. Receipts are the source; see `evidence/contracts/01-inbox.txt`.

## Deployment order

With no id to pin, the graph has no cycle:

1. `CaplaneInbox` and
   `CaplaneRegistry(forwarder, workflowOwner, workflowName, chainSelector)` — every constructor
   argument is known offline, so these can go in either order
2. Workflow config, carrying both addresses
3. `cre workflow deploy --deployment-registry private` — on the private registry the deploy lands
   `Active` and the first cron tick fires without a separate `activate`

Never rename the workflow after step 1: the name is immutable in the contract.

## Component count and order

`N` is 7 — the seven components of the claim schema. `k` is 6 of 7, calibrated against the
seeded corpus; the derivation is in `evidence/claim/02-threshold.txt`. The nearness predicate is
exact per-component equality — after hashing, nothing else is computable. Both may still move
if the measured rates demand it; neither is an interface change.

The interface does not constrain `N`: `componentCommitments` is a dynamic array and `matchesOf`
takes a variable-length one. What does constrain it is the golden vector and its test, which
must be regenerated together with any change.

The component *order* cannot change at all once a lien exists. The index is inside every
commitment preimage and the pepper does not rotate, so there is no reindex: appending an eighth
component is possible, inserting or reordering is not.

## Commitment encoding

Every scalar is one byte; the one variable field sits between fixed widths.

    componentDigest i     = keccak256(0x01 ‖ version:u8 ‖ claimType:u8 ‖ i:u8 ‖ utf8(component))
    componentCommitment i = keccak256(0x02 ‖ version:u8 ‖ claimType:u8 ‖ i:u8 ‖ utf8(component) ‖ pepper:32)
    lienId                = keccak256(0x03 ‖ version:u8 ‖ claimType:u8 ‖ digest[0] ‖ … ‖ digest[6])

The leading byte separates the three preimage spaces. Without it a digest preimage can equal a
commitment preimage whenever a component ends in the pepper's bytes — unreachable today only
because canonical text is letters and digits and the pepper is random binary, which is a
property of the inputs rather than of the construction.

The tuple is seven 32-byte digests, never seven strings. Joining the strings collides: a
character moved from one variable field into the next produces identical bytes, demonstrated on
the tax number and invoice number a real ledger issued.

The pepper is exactly 32 random bytes. It travels hex-encoded in its environment variable and
is decoded before use: used as 32 ASCII hex characters it would fall inside the canonical text
alphabet, and the two commitment tiers would stop being separated by their content as well as
by their domain byte.

`pepperVersion` enters no preimage. The pepper does not rotate, so a version that can never
change would be dead weight; it records which generation built the index.

⚠️ `contracts/abi/frozen.ts` still carries the shorter formula with an undefined bar, and it is
the file an implementer opens — it is vendored into `claim/abi/` and will be into the workflow.
This section is the authoritative encoding; that comment is an incomplete summary. Changing it
means regenerating every vendored copy so the drift rule approves them all at once.

## Not frozen

Storage slot layout · underwriting thresholds ·
deployed addresses and the workflow id · the enclave public key · ERC-4626 share math ·
Privy policy contents · the indexer's schema · human-readable rejection copy.
