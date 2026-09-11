# What the derivation hands to the rest of the system

## Two tiers, and who can compute each

The lien id carries no pepper, so a browser, the SDK and any third party derive it from a claim
they already hold. That is what makes the registry answerable without asking us.

The per-component commitments carry a pepper that lives in the vault, so only the enclave can
build the index they are looked up in. Without it the index would be brute-forceable: four of
the seven components are low-entropy enough to enumerate.

One function derives both. A second implementation is a second thing that can be wrong.

The lender SDK reexports the lien id and nothing else. The package surface stays whole — the
enclave consumes it entire — and the narrowing happens at the SDK, which is the layer a third
party installs. A library that appeared able to build component commitments would be promising
fuzzy queries it cannot answer.

## What cannot be changed after the first lien

The component index is inside every commitment preimage and the pepper does not rotate, so
there is no reindex. Appending an eighth component is safe. Inserting one, reordering them, or
changing how any component canonicalises is not — it silently orphans every lien derived before
the change, and nothing on-chain detects it, because Solidity only ever compares bytes32 and
never recomputes.

## The failure this encoding closes

Joining the seven components as strings collides. Moving one character from a variable field
into the next produces identical bytes, using values a real ledger issued: the debtor's tax
number and the invoice number, with one character shifted across the boundary. Two different
claims, one lien id, and the second borrower is refused as already encumbered — a denial of
service that costs the attacker nothing, and one the atomic lien-to-disbursement binding does
not close, because the attacker never registers anything.

Every scalar is one byte, the one variable field is bracketed, and the three preimage spaces
carry different leading bytes, so no shift survives.

## What the demonstration does not exercise

Only one claim type is ever derived. The domain separation that lets a lease and an invoice
share a registry is implemented and tested, but every claim in the demonstration is an invoice.

The production pepper has no vector. It never leaves the enclave, so the vectors use a published
test pepper. What they prove is that the derivation is correct and deterministic; that the
production pepper was the one used is shown only by a real execution.
