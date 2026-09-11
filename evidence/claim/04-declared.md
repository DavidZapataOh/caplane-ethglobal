# For the README's declared limitations

## The threshold rests on one ledger

Three of the seven components — currency, issuer and country — are properties of the
accounting system rather than of the claim, so every claim in this demonstration shares them.
The discriminating power on show is four components, not seven, and the value of the issuer
component cannot be demonstrated at all: proving it separates two organisations' identically
numbered invoices needs two organisations, and there is one.

The threshold was calibrated against a real corpus, and the corpus is small. What can be
claimed is that no reformatting real data produced falls below the threshold and that a second
real invoice reaches only three of seven. What cannot be claimed is a false-match rate; a rate
needs samples.

## Near-collision squatting is closed by a second mechanism, not by this one

Registering something that matches on k components without being the same claim is not
defeated by raising k alone. An attacker holding the debtor's identity and the invoice number
reaches five of seven — the two they guessed plus the three the ledger fixes — and needs only
the due date or the amount's order of magnitude to reach the threshold. Neither is secret.

It is closed by debtor confirmation, and by the atomic binding of a lien to its disbursement:
the attacker has to actually fund the advance, which means paying their victim. The threshold
makes the attack expensive; it does not make it impossible, and no single mechanism here does.

## A correction owed to the research

Two statements need amending, and neither changes the design.

The claim that the cited 2026 fuzzy-PSI paper measures false-match and false-non-match rates is
wrong. That paper declares the false-match rate out of scope — "a plaintext floor that we
inherit" — and measures realization soundness error instead. The rates are measured in the same
authors' 2021 paper, which is not cited and should be.

The instantiated parameters quoted from it — sixty-four components, threshold two — are hash
subsamples of a face embedding evaluated on face datasets. They are correctly quoted and are
not transferable to seven semantic fields: two of seven here is currency plus jurisdiction,
which every claim from one ledger shares.
