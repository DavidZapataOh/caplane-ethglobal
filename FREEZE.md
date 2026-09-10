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
Maximum 4,096 bytes total, which keeps the whole event inside the 5,120-byte LogTrigger budget.
The enclave's public key is published in `deployments.<network>.json`.

## Budgets

| Limit | Value | Measured |
|---|---|---|
| Report payload | 5,011 bytes (5,120 minus the 109-byte header) | golden vector: **576 bytes** |
| Transaction gas on Arc | 5,000,000 | — |
| `onReport` gas | budget ≤ 4,800,000 | — |
| `ClaimSubmitted` event | 5,120 bytes (LogTrigger) | — |
| `Lien` storage | 3 slots | reordering saves **24,248 gas** per lien |

## Deployment order

With no id to pin, the graph has no cycle:

1. `CaplaneInbox` and `CaplaneRegistry(forwarder, workflowOwner, workflowName)` — every
   constructor argument is known offline, so these can go in either order
2. Workflow config, carrying both addresses
3. `cre workflow deploy --deployment-registry private` — on the private registry the deploy lands
   `Active` and the first cron tick fires without a separate `activate`

Never rename the workflow after step 1: the name is immutable in the contract.

## Not frozen

Storage slot layout · `k`, `N` and the nearness predicate · underwriting thresholds ·
deployed addresses and the workflow id · the enclave public key · ERC-4626 share math ·
Privy policy contents · the indexer's schema · human-readable rejection copy.
