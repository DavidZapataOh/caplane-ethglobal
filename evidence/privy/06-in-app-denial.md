# The threshold denial, in the product

`00/06` proved the mechanism with a throwaway wallet and a script. This is the same control
reaching a real organization created through the application's own sign-up route, and refusing a
transfer in the interface rather than in a terminal.

Measured live on 2026-09-13 against `api.privy.io`, with the organization torn down afterwards.

⚠️ **The two route calls below were recorded before the routes required a session.** They are
reproduced verbatim because they are what was run, not what would be run today: both now answer
`401` without an `Authorization: Bearer <Privy access token>` header, and the transfer route no
longer accepts a wallet id from the caller at all — it reads one out of a token minted at sign-up
and bound to the signed-in user. Re-running them needs a browser login, which belongs to the
rehearsal. What the routes prove about the **policy** is unchanged, and the section below it —
signing straight against the Privy SDK, with no route in the path — reproduces today exactly as
written.

## The organization the route creates

`POST /api/organizations` with `{"name":"caplane-demo-verify-route"}` answered `200`:

    organization  cmtzb7bqn00ei0cl8q11jwyir
    wallet        0x3643Bb4219B942402E841c29F9c5835aB2D712bA

Created in that order because the API allows no other: `organizations().create()` requires
`default_key_quorum_id`, so the quorum exists before the organization does.

## The design the live check forced, and the check that forced it

The wallet is created with `owner: null` **explicitly**, never omitted. Omitting it makes the
organization's key quorum the wallet's owner, and a quorum-owned wallet requires an authorization
signature on every signing call. That was measured three ways before this route was written:

    same process, quorum keys in memory, no authorization_context   401 Missing privy-authorization-signature header
    same process, keys passed explicitly in authorization_context   signed, 228 chars
    separate process, appId/appSecret only, no quorum state         401 Missing privy-authorization-signature header

The middle run is what makes the other two mean something: the failure is not about crossing a
process boundary, it is about whether that particular call carries the keys. A server that
generates a quorum at sign-up and discards its private keys — as this one does, because a Next.js
route cannot hold every organization's keys between requests — would hand each business a wallet
that can never sign again.

So spend control lives in the policy, not in wallet ownership. The quorum still exists, as the
organization's administrative default for a future that wants multi-party approval of policy
changes; it is never a wallet owner.

**Verified on the wallet this route actually produced**, from a process that never held the quorum:

    below the threshold (0.001)   signed, 242 chars
    at the threshold   (0.01)     refused, 400 policy_violation

## The same pair through the route the page calls

Recorded before the session requirement landed; today each of these carries a bearer token and the
wallet is named by the sign-up binding rather than by `walletId`:

    POST /api/organizations/transfer   valueWei 1000000000000000    -> 200, signed transaction, 242 chars
    POST /api/organizations/transfer   valueWei 10000000000000000   -> 400
      {"status":400,"error":{"error":"RPC request denied due to policy violation",
        "code":"policy_violation"},"blockedByPolicy":true}

`blockedByPolicy` is what turns the page's alert from "the transfer could not be completed" into
"blocked by treasury policy". It is computed from the code Privy returned, not from the status:
`insufficient_funds` and `insufficient_correct_authorization_signatures` are also 400, also
refusals, and neither is this control. Telling a business its treasury rule stopped a transfer when
the wallet was merely empty would be a false claim about the one thing this flow exists to show.

## Why both rules, and why `lt` / `gte`

The policy carries an explicit ALLOW beside the DENY. Evaluation is deny-by-default per method, so
without it a transfer under the threshold would be refused too — and the refusal would be
attributable to "no rule matched" rather than to the threshold. Demonstrating a control means both
outcomes trace to a named rule.

`lt` below and `gte` at-or-above: every amount matches exactly one rule, with the threshold itself
on the deny side. A pair written `lt` and `gt` would leave the threshold matching neither.

## What this is not

`evidence/privy/03-denial.json` and `04-denial.http` prove the mechanism: a policy, on a throwaway
wallet, refusing a blocked recipient, captured with headers. This file proves the product: an
organization a person created through the interface, with a policy it received at sign-up, refusing
an amount in the surface a judge can open.

## What the routes refuse, verified after the session requirement

    POST /api/organizations            no Authorization header        401
    POST /api/organizations/transfer   no Authorization header        401
    POST /api/organizations/transfer   Authorization: Bearer <forged> 401

Authenticating is not authorising, and the second was the one that mattered: a signed-in visitor
could still name another organization's wallet id and have the app secret sign for it, capped only
by that organization's own threshold. Privy's organization resource carries no membership — id,
name and key quorum, nothing else — so the server has nobody to ask whether a caller owns a wallet.
The wallet id therefore stopped being caller input: it travels inside a token this server mints at
sign-up, and the transfer route reads it from there. Naming someone else's wallet is not a request
that can be made.

The 403 path — a valid session presenting a binding minted for a different user — is covered by
unit tests over the token (including a body swapped under a kept signature, and a token signed with
another key) plus the route's own comparison. Exercising it end to end needs two real browser
sessions, which belongs to the rehearsal.

## Teardown

The demo organization was deleted after these runs — `organizations().delete()` needs no
authorization signature, confirmed live, which is the same asymmetry that makes signing need one
and management not.
