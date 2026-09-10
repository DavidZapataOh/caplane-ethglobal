# Provider switch rule

The no-mocks rule's remedy is to switch to a different REAL provider, never to simulate.

Trigger: any signup that routes to sales, a contract, or a manual approval queue instead of
self-serve documentation. Deadline: switch the same working session.

The shared requirement across all three rows is narrower than price: **nothing may require
token rotation.** The enclave reads the vault and cannot write back, so a credential that
rotates on use strands the workflow after one execution.

| Dependency | Chosen | Fallback |
|---|---|---|
| Accounting | Custom connection, `client_credentials` | None ready. The obvious alternative is architecturally excluded: its discovery document advertises `"response_types_supported":["code"]` only, so no machine-to-machine grant exists, and its refresh token rotates on every use. A different accounting API would have to be sourced. |
| Screening | Consolidated Screening List, static header key | OpenSanctions, with two conditions: `limit=2` to stay under the 100 KB response cap, since its default match response reaches 207 KB; and its CC BY-NC data kept out of this repository, which is MIT. |
| Email | Any static-key provider | Many, interchangeable. This is the only row with real substitutes. |

## Attribution required by the screening provider

> This product uses the International Trade Administration's Data API but is not endorsed or
> certified.

This line has to appear in the README.
