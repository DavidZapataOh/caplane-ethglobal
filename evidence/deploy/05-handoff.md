# Deployment constraints handed to later plans

## The harness owns a funded hot key

The harness submits signed transactions continuously, so it needs a funded key living on the
worker around the clock. It is registered as `HARNESS_SIGNER_SECRET` and is deliberately not
the deployer key — if the harness burns it, the loss is a paused experiment rather than the
ability to deploy. Its gas draw over a multi-day judging window is undimensioned, and the
faucet ceiling is the constraint to watch.

Its loop sleeps between iterations. That is a cost decision, not a style one: billing is per
vCPU-minute, and the hard spend limit is destructive — reaching it shuts down every workload,
the public surfaces included.

## Killing the API costs two things, not one

The indexer and debtor confirmation share one process. Stopping it also stops debtor
confirmation and darkens the dashboard where the adversarial harness is seen bouncing. Both
are conveniences and the registry stays queryable, which is exactly the point being made. But
keep the outage short, and never schedule it mid-confirmation.

## The registry must survive that outage in code, not by luck

One project serves both the app and the registry, so they share one variable set: an API URL
the app needs is automatically present in the registry's deployment. The guarantee is a
hygiene rule over the registry's route instead — `registry-reads-chain-only` — because a
variable that merely happens to be unused is not a guarantee.

## The mode falls back, it does not fail

A request arriving on a preview URL, a `*.vercel.app` host, or the apex before DNS catches up
resolves to dark rather than rendering with no palette. The proxy rewrites the host into a
path segment rather than reading headers in the layout, because reading headers there is
request-time API and would opt every route out of prerendering; both trees prerender instead.

The proxy matcher excludes `/.well-known`. Swallowing it means the domain resolves and never
gets a certificate.

## The outage posture

Judging is asynchronous over days. If a platform is down, the durable artifacts are the video,
`evidence/` and the README — and the registry's real fallback is the block explorer, which is
a virtue of the design rather than an excuse. But a live deployment is what the record says
correlates with placing, so the posture is restore fast, not shrug.
