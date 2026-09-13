# Related work

Three papers describe the problem this registry addresses, and each closes it differently. The
comparison is the point: a design that cannot say where it departs from the literature is either
unaware of it or repeating it.

## Trustless Provenance Trees: A Game-Theoretic Framework for Operator-Gated Blockchain Registries

**arXiv:2604.03434v1** · Ian C. Moore (founder, AnchorRegistry), April 2026

**What it names.** Names the operator trust problem: an on-chain record alone cannot distinguish a registration a user asked for from one an operator made unilaterally. Closes it game-theoretically — false attribution is strictly dominated, honest reporting the unique equilibrium — while its own Axiom 4 keeps a whitelisted operator wallet in the design.

**Where Caplane diverges.** Caplane closes the same problem structurally rather than by incentive: there is no operator wallet to whitelist. The registry accepts a write only from the DON forwarder, gated on consensus over an enclave attestation, so a unilateral registration is not irrational — it reverts.

## Reliable Homomorphic Matching for Fuzzy Labeled PSI at Scale

**arXiv:2606.27803v2** · Erkam Uzun, June 2026

**What it names.** Names Fuzzy Labeled Private Set Intersection: a receiver learns the label of a similar enrolled record and nothing else, which is the exact shape of a lien query. Identifies the realization soundness error — a base-kernel construction reaches 100% RSE at a million records, while independent-token rounds hold it at zero.

**Where Caplane diverges.** Caplane reaches RSE zero by construction rather than by multi-round amplification, because the fuzzy match runs in plaintext inside an attested enclave instead of under FLPSI cryptography. That is a trade, not a win: cryptographic hardness is exchanged for a hardware trust base, which the DON verifies rather than removes.

## Gyokuro: Source-assisted Private Membership Testing using Trusted Execution Environments

**arXiv:2603.23226** · March 2026

**What it names.** Names source-assisted private membership testing: a client proves membership without revealing the item, using compact information the source issues when the item is first submitted — and places the primitive alongside certificate transparency and supply-chain auditing.

**Where Caplane diverges.** No structural divergence is claimed. This is the primitive Caplane already is, applied to liens: the enclave issues the commitment at registration, and every later query proves membership without revealing the right behind it. Citing it as a contribution of ours would be taking credit for the name of the thing.

## Domain support

**arXiv:2407.19979** — "Privacy-preserving Fuzzy Name Matching for Sharing Financial Intelligence"

Financial institutions sharing intelligence to detect laundering and fraud under the limits regulation puts on sharing data. It confirms that privacy-preserving fuzzy matching is a recognised problem in this exact domain rather than one invented to justify a design. It is not counted among the three: it offers no closure to diverge from.

<!-- Generated from scripts/docs/. Edit the data there, not this file. -->
