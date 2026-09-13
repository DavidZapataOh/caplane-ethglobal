# The sponsor rubric, run against this submission

The published must-pass list is the closest thing to a written judging criterion that exists.
Every point below claims exactly one kind of proof — a gate that would catch a regression, a
measurement on disk, or an argument — and a test refuses a point that claims none.

| # | Violation | How this avoids it | Proof |
|---|---|---|---|
| 1 | `Date.now()`, `new Date()` or `time.Now()` instead of the runtime clock in DON mode. | The workflow computes dates from integers and takes the time from `runtime.now()`. `epochOf` parses an ISO date by civil arithmetic precisely because the determinism validator rejects `Date`. | gate `enclave-safe-javascript` |
| 2 | `Math.random()`, `math/rand` or `crypto/rand` instead of `runtime.Rand()` in DON mode. | Nothing in the workflow is random. The envelope’s randomness is generated in the submitter’s browser, before the chain. | gate `enclave-safe-javascript` |
| 3 | Hardcoded API keys, private keys or credentials instead of `runtime.getSecret()`. | Every secret is fetched inside the enclave in one batched call, and no credential is committed. | gate `no-committed-credentials` |
| 4 | TypeScript `number` for Solidity integers instead of `bigint`. | Every on-chain quantity crosses as `bigint`, and the chain selector exceeds `Number.MAX_SAFE_INTEGER` so it is a string everywhere JavaScript reads it. | [`evidence/cre/14-determinism-audit.txt`](evidence/cre/14-determinism-audit.txt) |
| 5 | Omitting consensus aggregation when fetching external data over HTTP. | Not applicable to the TEE path, and declared rather than silently skipped. | declared, see below |
| 6 | Using `await` instead of `.result()` for CRE capability calls. | Capability calls resolve with `.result()` throughout the workflow. | [`evidence/cre/14-determinism-audit.txt`](evidence/cre/14-determinism-audit.txt) |
| 7 | Unsorted map iteration in Go where order affects output. | The workflow is TypeScript. Where order affects a hash, the order is a frozen array, not a map. | gate `frozen-artifact-drift` |
| 8 | `Promise.race()` or `Promise.any()` in TypeScript in DON mode. | Neither appears in the workflow. Concurrency that would make the output depend on timing is not used. | gate `enclave-safe-javascript` |
| 9 | Mis-converting units: percentages, basis points, token decimals, timestamps, gas, fixed point. | The amount is compared as decimal text, never as a double, and scaled by the currency’s own exponent rather than a hardcoded 100 — JPY has none and KWD has three. Arc’s native USDC is 18 decimals while the ERC-20 is 6, and the two are never mixed. | [`evidence/claim/01-agreement.txt`](evidence/claim/01-agreement.txt) |
| 10 | Config, docs and tests that disagree on schedules, thresholds, units, identifiers or secret names. | The threshold is imported, never redeclared. Budgets are compared against platform limits and against real measurements, and generated documents fail CI when they drift from their data. | gate `secret-names-registered` |
| 11 | Delivering a concept document where something executable was asked for. | Four contracts deployed and verified, a workflow deployed and executed, five live surfaces, and 295 tests. | [`evidence/cre/18-full-cycle.txt`](evidence/cre/18-full-cycle.txt) |
| 12 | Leaving template or hello-world documentation in the generated project. | No template scaffolding survives, and the CRE template’s mock server is used nowhere. | gate `no-template-scaffolding` |
| 13 | Silently substituting a different resource or action model than the one asked for. | The frozen ABI is the contract with every consumer, and a drift test fails if any vendored copy diverges from it. | gate `frozen-artifact-drift` |
| 14 | Reading, printing or exfiltrating wallet credentials, keystores or secret file contents. | Secrets are read once, inside the enclave, and reported by length rather than by value. A rule refuses any path that would carry one back out. | gate `no-secret-through-the-door` |
| 15 | In a confidential workflow: calling `ConfidentialHTTPClient` from inside a TEE handler, declaring `vaultDonSecrets` for one, or passing a raw secret or confidential payload through `usingTheDons()`. | Neither identifier appears in the workflow package, and what crosses back is a report body of derived values — never the plaintext claim. | gate `no-forbidden-cre-identifiers` |
| 16 | Claiming Confidential Workflows keeps the workflow logic or binary confidential, or inventing a TEE type or region other than AWS Nitro in `us-west-2`. | We claim neither. The DON sees the binary and the logic; only the data it computes over stays inside. The constraint literal is AWS Nitro in `us-west-2`, and the simulation banner echoes it resolved rather than accepted as text. | gate `approved-tee-constraint` |

## The two that need an argument

**Point 5.** The point assumes DON mode, where each node observes its own response and there is divergence to reconcile. Inside the enclave the body runs once, so there is nothing to aggregate. It is also not a choice: the `sendRequest` overload that takes an aggregator requires a `Runtime`, and a TEE handler holds only a `TeeRuntime`. Obtaining the former means `usingTheDons()`, which takes the request out of the enclave — so complying with this point literally would violate point 15.

**Point 16.** This is the one where saying the wrong thing is itself the failure. Confidential
Workflows does not keep the workflow logic or the binary confidential — the DON sees both. What
stays inside the enclave is the data the logic computes over. We make no claim beyond that.

## The confidential-workflows checklist

| Item | Where | Evidence |
|---|---|---|
| Registers the handler with `handlerInTee` plus a TEE constraint | Two handlers, one per trigger — `caplane-workflow/workflow.ts:242` and `:255` | [`evidence/cre/02-simulate.txt`](evidence/cre/02-simulate.txt) |
| Fetches secrets with `getSecret` inside the enclave | One batched read at the top of the handler; nothing is fetched outside | [`evidence/cre/08-secret-ring.txt`](evidence/cre/08-secret-ring.txt) |
| Makes enclave HTTP calls with the standard client, passing the `TeeRuntime` | The ledger, the sanctions list and the registry read, all from inside | [`evidence/cre/09-external-verification.txt`](evidence/cre/09-external-verification.txt) |
| Crosses back with `usingTheDons()` carrying only derived, non-sensitive values | The report body is a verdict and four numbers — never the claim | [`evidence/cre/12-report.txt`](evidence/cre/12-report.txt) |
| Keeps in-enclave logging out of production code | No logging inside the TEE handler in the deployed build | [`evidence/cre/14-determinism-audit.txt`](evidence/cre/14-determinism-audit.txt) |
| States that deployment requires private-beta enrolment while simulation does not | Stated below, with the workflow id of a deployment that happened | [`evidence/cre/04-deploy.txt`](evidence/cre/04-deploy.txt) |

## On the private beta

Deploying a confidential workflow requires enrolment in the Confidential Workflows private beta;
simulating one does not. We have the enrolment, and the workflow is deployed: workflow id
`006818407cb18ada74aa7cad0880ff10bc88cc93b8ad69c14204e5feb4bee17e`. So this is context rather
than a limitation — but it is stated, because a reader who does not have it would otherwise
reproduce the simulation and conclude the deployment was never possible.

<!-- Generated from scripts/rubric/. Edit the data there. -->
