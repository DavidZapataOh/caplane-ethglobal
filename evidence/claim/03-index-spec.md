# What `matchesOf` has to do, and what it must not

`matchesOf(bytes32[] calldata) returns (bytes32 lienId, uint8 matched)` promises "the active
lien matching the most components". The set is defined — active liens — but no data structure
exists to walk it. Walking every active lien grows with the registry, and a `view` is bounded by
the node's call gas cap rather than the block limit: bounded, but by something outside our
control.

## Index three, score seven

    indexed    debtorTaxId, invoiceNumber, dueDate
    scored     all seven

The posting lists are keyed on the three indexed commitments. The component's position is inside
every commitment preimage, so a position-1 commitment can never equal a position-2 one: one flat
table suffices and the key needs no position qualifier.

Scoring runs over all seven. The tally over the index selects who is examined, never who wins —
scoring only the indexed components would return the wrong lien and a count whose denominator no
longer matches the threshold it is compared against.

## Why the ledger constants are excluded

Three of the seven components are properties of the ledger, not of the claim: currency, issuer
and country are identical across every claim one organisation ever pledges. A posting list keyed
on one of them holds the entire registry, so it bounds nothing and is the most expensive list to
walk.

They stay in the tuple. They still hash with their position and still count toward `matched`, and
they are what will separate two ledgers the day there are two.

## Why the amount bucket is excluded too, which is the correction

This document previously said four, and four was the right answer to a question nobody finished
asking. Excluding the ledger constants was correct; measuring what was left was not done.

The amount bucket behaves like a fourth constant. Measured over 43 receivables this project did
not create:

    component        distinct values   largest posting list
    invoiceNumber          43                 1   (2%)
    dueDate                23                 5   (12%)
    debtorTaxId            22                 5   (12%)
    amountBucket            7                19   (44%)

A doubling bucket has a handful of values by construction and gains no more as the registry
grows, so its list grows with the registry and the walk grows with it. Measured: indexing four
makes the walk linear in registry size and passes the call cap observed on Arc's primary endpoint
at a few thousand liens: the registry would break by succeeding.

Indexing three, the cost is flat. Measured against this registry, cold, with a thousand liens
written through the real report path: **60,044 gas at 43 liens and 62,522 at 1,000** — a 4%
difference across a registry twenty-three times larger.

## Dropping it costs no recall at the threshold

At 6 of 7, three components are ledger constants, so at most one of the four discriminating
components differs — meaning at least two of any three of them still agree. The argument does not
depend on the data. The data agrees with it:

    threshold   pairs   missed by a 4-index   by a 3-index   by a 2-index
    k >= 6         1            0                  0              0
    k >= 5        47            0                  0             28
    k >= 4       247            0                176            212

Three is the floor: it keeps a full step of margin if the threshold ever moves to 5, and only
breaks at 4. Two would survive today's threshold with no margin at all.

## What `matched` is, and what it is not

It is the best score among liens sharing at least one INDEXED commitment, not the unqualified
maximum the interface's wording suggests. A claim whose three indexed components all differ from
everything stored has no candidate and the call returns `(0, 0)` — where the off-chain
`agreement()` would return 3 for the same pair, counting the ledger constants. Both are below any
usable threshold, so the verdict is unaffected, but the two counters are not the same function,
and the measured rates describe `agreement()`.

## Consequences worth stating before they are discovered

Ties are possible and are resolved by the lower `lienId`. Iteration order cannot decide it: two
nodes running the same `eth_call` would disagree.

A candidate reachable through two or three indexed components is scored more than once. That is
deliberate: EIP-2929 makes the repeats warm, while deduplicating in memory costs O(C squared) and
transient storage is unavailable — `TSTORE` reverts inside `STATICCALL`.

The walk is never truncated. A cap would return a count that is too low, turning a hard failure
into a silent soundness hole exactly where correctness matters. An `eth_call` over the node's cap
returns an RPC error, and the caller must treat that as "cannot decide", never as "no collision".

A released lien is skipped but its posting entries are never removed, so the lists grow with liens
ever recorded rather than liens active. The flat cost above is flat in registry size, not in how
many liens share one debtor and one due date: two hundred that do cost 5,075,156 gas, 17% of the
cap. Density is bounded by nothing here, and that is the honest edge of the claim.

## What this does not decide

Storage layout, the gas snapshot and the deployed cost belong to the registry's own plan. The
threshold belongs to the enclave and never appears in Solidity, which is what lets `k` move
without redeploying.
