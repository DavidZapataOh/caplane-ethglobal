# What `matchesOf` has to do, and what it must not

`matchesOf(bytes32[] calldata) returns (bytes32 lienId, uint8 matched)` promises "the active
lien matching the most components". The set is defined — active liens — but no data structure
exists to walk it. Walking every active lien grows with the registry, and a `view` is bounded
by the node's call gas cap rather than the block limit: bounded, but by something outside our
control.

## Index four, verify seven

Three of the seven components are properties of the ledger, not of the claim: currency, issuer
and country are identical across every claim one organisation ever pledges. A posting list
keyed on any of them holds the whole registry, so it bounds nothing and is the most expensive
list to walk.

    indexed    debtorTaxId, invoiceNumber, amountBucket, dueDate
    verified   all seven

The shape that follows: look up the four indexed commitments to build a candidate set, then
score **every candidate over all seven** of its stored commitments and return the best of those
with its count. Scoring only the four would return the wrong lien — a candidate leading on
indexed components can lose on the full count once the constants are added — so the tally over
the index selects who is examined, never who wins.

This narrows the interface's promise, and the narrowing is deliberate rather than glossed:
"the active lien matching the most components" becomes "the best among liens sharing at least
one discriminating component". A lien sharing only the three the ledger fixes is not a
candidate and is not reported. That is the intended reading — a match on currency, issuer and
country alone carries no information about the claim — but it is a reading, and the
implementation should carry it as a comment so nobody later "fixes" it back into a full scan.

## Consequences worth stating before they are discovered

A claim whose four discriminating components all differ from everything stored has no
candidate, and `matchesOf` returns `(0, 0)`. Note what that hides: every active lien from this
ledger does share three components with it. Returning zero rather than three is the narrowing
above, and it is the right answer for the caller — three constants are not evidence — but the
count is not the unqualified maximum the NatSpec reads as.

A claim that shares one discriminating component with many liens produces a long tally. The
worst realistic case is `amountBucket`, which is doubling and therefore wide: bucket 24 holds
every amount from 16,777,216 to 33,554,431 minor units — 167,772.16 to 335,544.32 in major
ones. That is the list to measure first.

Duplicate or over-length arrays are not part of this design. The array is positional and the
index travels inside each commitment's preimage, so a query carrying two candidates for one
slot has no meaning the function can honour. The frozen interface declares no error for it and
adding one is a four-way break, so this is out of scope here: the enclave is the only caller
and never sends one. What the behaviour actually is belongs in the invariant and fuzz suite.

Ties are possible and must be resolved deterministically — two liens matching equally cannot
depend on iteration order, or two nodes computing the same `eth_call` could disagree.

## What this does not decide

Storage layout, the tally structure, and gas. Those belong to the registry plan. This file
fixes only what may be indexed, and why indexing the rest would be indexing nothing.
