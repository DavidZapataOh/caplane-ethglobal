import { ClaimType } from '../abi/frozen'
import { componentCommitments, lienIdOf } from '../commit'
import type { ClaimComponents } from '../schema'
import { VECTORS } from '../vectors'

// No top-level await anywhere on this path: it compiles and then traps at runtime with
// RuntimeError: unreachable, because the enclave's event loop is not enabled.
const components = VECTORS.invoice.components as unknown as ClaimComponents

console.log(
  JSON.stringify({
    lienId: lienIdOf(ClaimType.Invoice, components),
    commitments: componentCommitments(ClaimType.Invoice, components, new Uint8Array(VECTORS.testPepper)),
  }),
)
