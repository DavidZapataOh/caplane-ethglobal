# Evidence

Ninety-nine files, measured rather than asserted. This page exists because a directory listing is
not a record: it tells a reader that work happened without telling them what any of it proves.

Every claim below points at the file that carries it. Where a measurement is weaker than it looks,
the file says so in its own words — the sections headed *what this does not prove* are not an
afterthought, they are the reason the rest is worth reading.

## Start here

Three artifacts answer the question most readers arrive with — *did this actually run?*

| | Where | What it is |
|---|---|---|
| **The enclave ran** | [`cre/02-simulate.txt`](cre/02-simulate.txt) | The TEE simulation under real production limits. The banner echoes the **resolved** constraint — AWS Nitro, `us-west-2` — so the constraint literal parsed rather than being accepted as text. Production limits were enforced, not the simulator's permissive defaults. |
| **The workflow is registered** | [`cre/04-deploy.txt`](cre/04-deploy.txt) | Workflow ID `006818407cb18ada74aa7cad0880ff10bc88cc93b8ad69c14204e5feb4bee17e`, registered from the binary. [`cre/16-first-lien.txt`](cre/16-first-lien.txt) carries the ID of the execution that recorded the first lien. |
| **It touched the chain** | [`cre/18-full-cycle.txt`](cre/18-full-cycle.txt) | Record, refuse and release, end to end, with block numbers and transaction hashes. |

**Every transaction hash in this directory was re-checked against Arc Testnet on 2026-09-13.**
Forty-two 32-byte hashes appear across these files; fifteen are transactions and all fifteen are
present on chain with a success status. The other twenty-seven are lien, claim and submission
identifiers, which are not transactions and do not resolve to one — that difference is deliberate
and is explained in [`claim/03-index-spec.md`](claim/03-index-spec.md).

Anyone can repeat the check without a credential:

```bash
curl -s https://rpc.testnet.arc.io -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_getTransactionReceipt","params":["<hash>"]}'
```

## The thesis, in four files

The claim this project makes is that the same receivable cannot be pledged twice, and that nobody —
including us — can write the record. These four carry it:

- [`cre/17-collision-fires.txt`](cre/17-collision-fires.txt) — the collision check refusing a second
  submission on chain, by name. It also states, at length, what it is **not**: seven of seven, not
  six of seven, and why the fuzzy tier cannot be isolated against this ledger.
- [`claim/09-rates.txt`](claim/09-rates.txt) — the false-match rate over 903 pairs of real invoices,
  with a Clopper-Pearson bound, and the single false match at the chosen threshold opened rather
  than counted.
- [`claim/02-threshold.txt`](claim/02-threshold.txt) — six real renderings of one invoice, all
  surviving the threshold, and a genuinely different invoice scoring far below it.
- [`harness/01-continuous-refusal.txt`](harness/01-continuous-refusal.txt) — ten live attempts to
  pledge an already-pledged receivable, ten refusals, and the discriminator that stops a registry
  outage from being counted as a proof.

## By surface

| Directory | What it records |
|---|---|
| [`arc/`](arc) | The chain itself: faucet, RPC behaviour, toolchain, EVM conformance, a real transaction, the underpriced case, the explorer. |
| [`contracts/`](contracts) | Registry, inbox, pool, escrow and custody, with a versioned gas snapshot and the invariants. |
| [`cre/`](cre) | The confidential workflow, in order: entitlements, simulation, secrets, deployment, execution, the log trigger, the envelope, external verification, the collision check, the debtor confirmation, the report, release and default, the determinism audit, and three live cycles. |
| [`claim/`](claim) | Canonicalisation and the commitment index: agreement, threshold, index spec, encoding vectors, dual-runtime equality, the corpus, the measured rates, and the second instrument type. |
| [`data/`](data) | The third-party sources: endpoint preflight, the accounting ledger, the invoice corpus, the sanctions screening, mail delivery, and the limitation this project declares rather than hides. |
| [`privy/`](privy) | The wallet layer: SDK surface, a signature on Arc, organizations, a policy denial captured as JSON and as a raw exchange, and browser signing. |
| [`web/`](web) | The app surfaces: the public lookup, design-system contrast, the submission flow, the investor cycle, and the performance budget. |
| [`api/`](api) | The convenience layer: latency, the activity feed, scope isolation, and debtor confirmation. |
| [`harness/`](harness) | The adversarial run. |
| [`sdk/`](sdk), [`mcp/`](mcp) | A third party reading the registry, and the tool server's conformance and divergence. |
| [`deploy/`](deploy) | DNS with TLS, the worker platform, variables, the deployment handoff, the deployed contracts, and verification. |
| [`site/`](site), [`brand/`](brand) | The landing's own test output, Lighthouse, screenshots, and the brand handoff. |
| [`storage/`](storage) | Storage layouts for the four contracts. |
| [`repo/`](repo) | What the repository asserts about itself: the threat model, the related work, and the sponsor rubric run point by point against the source. |

Three files sit at the top level rather than in a surface: [`measured.json`](measured.json) is what
the budget gate in CI compares against, [`test-count.json`](test-count.json) is the suite size the
README cites, and [`report-golden-vector.txt`](report-golden-vector.txt) pins the report encoding.

## How to read any of these

Each file opens with what it proves and, where it matters, what it does not. That second half is
where the value is. A measurement that only ever says yes is indistinguishable from one that cannot
say no, and several of these exist specifically to record a negative control — a gate switched off
to confirm it was a gate at all.

Two examples worth reading for the method rather than the result:

- [`cre/10-collision-check.txt`](cre/10-collision-check.txt) — pointing the configuration at the
  wrong contract yields `undecidable`, not `clear`. A registry that cannot answer and a registry
  that answers no are the difference between refusing a pledge and writing a second one over it.
- [`web/03-submission-flow.txt`](web/03-submission-flow.txt) — the four invoice fields are absent
  from the bytes on chain, and the same byte search finds every one of them inside the opened
  envelope. Without the second half, "absent" would mean nothing.
