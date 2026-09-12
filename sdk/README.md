# @caplane/sdk

Read the Caplane lien registry on Arc Testnet from your own machine, against your own endpoint.
No account, no key, and no Caplane service in the path.

```ts
import { createCaplaneClient, isEncumbered, lienOf, liensOf, statusOf } from '@caplane/sdk'

const client = createCaplaneClient()
await isEncumbered(client, lienId)
await lienOf(client, lienId)
await liensOf(client, borrower)
```

## Install

There is no npm publication: no organisation, no token, no release flow. A git dependency does not
work either, because this package lives in a subdirectory and a git dep installs the repository
root. What works is a file dependency, the way the other packages here consume each other, or a
tarball:

```
npm install ../sdk          # or: npm pack && npm install ./caplane-sdk-0.1.0.tgz
```

## What this proves

The registry has no owner, no pause and no proxy, and its only write path is a DON-signed report
from an attested enclave. Four immutables you can read yourself pin who may write to it, and the
client refuses a contract whose frozen workflow name does not match — a wrong address, an empty
registry and a dead endpoint otherwise all look like a registry holding nothing.

So an answer here is exactly as trustworthy as the endpoint you chose, your belief that this address
is Caplane's registry, and the enclave trust base the record was written under.

## What it does not

**You cannot go from a receivable to a lien id.** The registry key is derived with a secret that
never leaves the enclave, so holding the document tells you nothing about whether it is pledged.
Ask about a lien id you were given, or enumerate by borrower address.

**`isEncumbered` is `status == 1` and nothing else.** Released and defaulted are terminal and free
the receivable. An expired lien nobody released still reads encumbered: the registry never flips a
lien on the clock.

**Two endpoints are a cost, not a proof.** This chain has no light client, so a node can lie. Every
point read asks both defaults and refuses a disagreement, which means lying takes two operators
agreeing. Pass `quorum: false` with your own node if you would rather not pay the round trip.

**`liensOf` asks one endpoint.** The two defaults do not share a log-range limit — measured, the
second refuses a two-thousand-block query while reporting a ten-thousand-block cap, and accepts a
hundred — so a quorum scan from the deployment block would need hundreds of requests per endpoint
against a rate limiter. An endpoint that omitted a `LienRecorded` would show less pledged than there
is. Pass your own node if that matters.

**`matchesOf` is on the contract and is not exposed here.** It takes peppered component commitments,
and the pepper is an enclave secret, so no third party can build its argument. Asking the fuzzy
question costs a transaction, not a call.

**A lien proves uniqueness, not existence.** That the receivable is real rests on the accounting
ledger, the debtor's confirmation and the enclave. None of the three is checked here.

**The privacy is stable pseudonymity, not unlinkability.** The pepper does not rotate, so the same
debtor produces the same commitments for as long as the registry lives, and the endpoint you query
sees which ids you asked about.

## Addresses

Read from `abi/deployments.arc-testnet.json`, never retyped. They changed once already.
