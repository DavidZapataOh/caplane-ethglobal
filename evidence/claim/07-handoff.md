# What the derivation hands to the rest of the system

## Two tiers, and who can compute each

⚠️ **Corrected 2026-09-12.** This section said the lien id carries no pepper, and that a browser,
the SDK or any third party derives it from a claim they hold. That was true and is not: the lien id
was a pepper-free hash of the same seven components, published in `LienRecorded`, and it inverted by
brute force in 71 ms against the seeded corpus — yielding the debtor, the invoice number, the due
date and the amount bucket. Three of the seven carry no entropy at all, because currency, country
and the issuer are constants of one ledger. The pepper that protects the component index has to
protect the key derived from the same components.

So there are three tiers, not two:

The **claim id** carries no pepper. It is what the debtor's confirmation signs, in its own preimage
space, and it has to be pepper-free because the signing tool runs on the debtor's side — giving it
the pepper would take the pepper out of the enclave. It is safe there because it never leaves the
sealed envelope.

The **lien id** carries the pepper. It is the registry key. Nobody outside the enclave can derive
it, so a third party consults a lien id the enclave gave them, or enumerates by borrower address.

The **per-component commitments** carry the pepper too, so only the enclave can build the index they
are looked up in. Without it the index would be brute-forceable.

One function derives both. A second implementation is a second thing that can be wrong.

The lender SDK reexports **no derivation at all**. It observes and decodes: a lien id goes in and
state comes out. It cannot go from a receivable to a lien id, it does not seal envelopes, and it
never sees the pepper — so it has nothing to narrow. A library that appeared able to build
component commitments, or to derive a key from a claim, would be promising queries it cannot
answer.

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
