# For the README's declared limitations

## One of the two rates is a rate

The false-match rate is measured over 903 pairs of invoices this project did not create — 43
receivables the accounting sandbox shipped with, every pair compared. The false-non-match
figure is not a rate and is not presented as one: it counts how many documented renderings of
one invoice survive the threshold. A rate there would need the same claim as a second lender
transcribed it, and a second lender is exactly what a hackathon cannot supply. One rendering
was produced by the ledger itself — the same invoice carries a net and a gross figure — and it
is marked as such.

## The ledger is one ledger

Currency, issuer and country are identical across every claim measured, so every pair starts at
three of seven. Four components do the discriminating. The issuer component cannot be exercised
at all: showing that it separates two organisations' identically numbered invoices needs two
organisations.

The amount bucket is close to a fourth constant here. Real amounts span 105.60 to 7,150.00 and
19 of 43 fall in one doubling bucket. That concentration is real data behaving worse than a
generator would, and it is reported rather than smoothed.

Debtors are identified by name almost everywhere: the ledger carries a tax number for one
contact out of eighty-three. A name discriminates worse than a tax number, so both figures are
pessimistic against a deployment where debtors are identified fiscally — the right direction to
be wrong in.

## What came out

At the chosen threshold, one pair of the 903 agrees on six of seven: two invoices to the same
debtor, same amount, same due date, differing only in their number. Opened rather than counted.

  k=6   1 of 903   0.111%   95% upper bound 0.524%
  k=5  47 of 903   5.205%   95% upper bound 6.589%

## What cannot be measured below

Every figure here is an interval, not a point. A single false match in 903 pairs reads as
0.11%, and the honest bound on it is about five times that. Zero matches would not have meant
zero either — it would have meant under 0.34%.

Seeding more invoices does not sharpen this. Rows from one generator correlate with one
another, so they add volume without adding independence. The invoices the ledger shipped with
are the ceiling, and that is a limit of the sandbox rather than of the design.

The ledger itself is not permanent: the demonstration company resets, and what was added to it
goes with the reset. The measurement above is dated 2026-09-10 and reproducible from the corpus
committed beside it, which is why the corpus is committed rather than re-pulled.
