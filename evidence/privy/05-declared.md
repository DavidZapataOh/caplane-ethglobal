# For the README's declared limitations

## Policy enforcement is not uniformly in the enclave

Privy evaluates signing-path rules — conditions on transaction fields and on decoded calldata —
inside its secure enclave. It evaluates transfer-size limits at the API layer, because those
require transaction simulation, which runs outside the enclave. Their documentation says so.

We record two denials for that reason. The `eth_signTransaction` denial is enclave-evaluated
and leaves only an HTTP 400. The `transfer` denial is API-layer and leaves a persisted,
fetchable record. Neither alone has both properties, and we do not claim the enclave blocked
the one it did not.

The denial response does not name the rule that fired — deliberately, so a caller cannot
enumerate a denylist by probing. Attribution rests on the control run instead: the same
request with an allowed recipient returns a signature over the same wire in the same execution.

The denial wallet carries no quorum owner, and that is a deliberate narrowing rather than a
convenience. A quorum-owned wallet refuses with `insufficient_correct_authorization_signatures`
— a real block, but by a different control. An artifact that conflates two controls proves
neither, so the quorum is demonstrated on its own wallet and the policy on its own.

## Privy signs, but never sees the claim

Privy's API sits in the signing path. It does not sit in the confidentiality path: the claim is
encrypted in the browser to the enclave's public key before any transaction is built, so Privy
handles ciphertext it cannot read. And it is not in the registry's trust path — the registry's
only writer is the KeystoneForwarder, and every lien stays readable from a block explorer if
Privy disappears.
