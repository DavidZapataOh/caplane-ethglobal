import { ClaimType } from '../abi/frozen'
import { claimIdOf, componentCommitments } from '../commit'
import { seal } from '../envelope'
import envelopeVector from '../fixtures/envelope.json'
import type { ClaimComponents } from '../schema'
import { VECTORS } from '../vectors'

// No top-level await anywhere on this path: it compiles and then traps at runtime with
// RuntimeError: unreachable, because the enclave's event loop is not enabled.
const components = VECTORS.invoice.components as unknown as ClaimComponents

// Fixed ephemeral key and nonce: with deterministic inputs the sealed bytes are comparable
// between engines, which is the only way to tell a working curve from one that merely runs.
const bytes = (s: string) => Uint8Array.from((s.slice(2).match(/../g) ?? []).map((b) => parseInt(b, 16)))
const hex = (b: Uint8Array) => '0x' + [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
const v = envelopeVector.canonical

console.log(
  JSON.stringify({
    claimId: claimIdOf(ClaimType.Invoice, components),
    commitments: componentCommitments(ClaimType.Invoice, components, new Uint8Array(VECTORS.testPepper)),
    envelope: hex(
      seal(
        new TextEncoder().encode(v.plaintext),
        bytes(v.recipientPublicKey),
        bytes(v.authorizedSubmitter),
        bytes(v.ephemeralSecret),
        bytes(v.nonce),
      ),
    ),
  }),
)
