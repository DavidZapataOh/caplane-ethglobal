# Which credential belongs on which target

The rule, stated once: **a credential the enclave consumes never appears on a platform
variable surface.** Three of them are in that category, and putting them on Vercel or Railway
would not be a hygiene slip — it would be a thesis failure. The accounting API and the
screening list are queried *inside* the TEE precisely so that no server of ours can read the
invoice. A copy of those credentials on a platform hands a server exactly that ability, which
is the gap in the competing design we describe as our advantage.

| Name | Vercel | Railway | Note |
|---|---|---|---|
| `NEXT_PUBLIC_PRIVY_PUBLIC_APP` | `web`, `site` | — | Public by design; it ships in the browser bundle |
| `PRIVY_SERVER_CREDENTIAL` | `web` | — | |
| `ARC_TESTNET_RPC_URL` | both | all three | A public endpoint, not a secret |
| `NOTIFY_TRANSPORT_KEY` | — | `api` only | Debtor confirmation runs there |
| `HARNESS_SIGNER_SECRET` | — | `harness` only | See below |
| `LEDGER_APP_ID` · `LEDGER_APP_PASSPHRASE` · `WATCHLIST_SUBSCRIPTION` | — | — | **Enclave credentials. Vault only** |
| `CRE_ETH_PRIVATE_KEY` · `ARC_TESTNET_DEPLOYER_PRIVATE_KEY` | — | — | Local `.env` only |

Chain constants — chain id, forwarder address, explorer — are **not** duplicated as platform
variables. They come from the frozen address book, and duplicating a constant that already has
one authoritative home is how the two copies end up disagreeing.

## The harness key nobody had

The adversarial harness signs transactions to the Inbox continuously, so it needs a funded hot
key running around the clock. No plan named it, registered it, or budgeted its gas, and the
faucet's throughput was never sized against a permanent consumer.

It is registered as `HARNESS_SIGNER_SECRET`, deliberately disjoint from every other name so
the secret-name resolver cannot confuse it with another.

**It is not the deployer key.** They are separated for one reason: if the harness drains its
key, the loss is a paused experiment. If it drained the deployer key, the loss is the ability
to deploy at all, in the last hours before the deadline.

## Loading them without printing them

Values are piped in rather than passed as arguments, so they never appear in a shell history
or a process list. On Railway, `--skip-deploys` matters: without it each variable set triggers
a redeploy.
