import { ClaimType } from '../../../../claim/abi/frozen'
import { toComponents } from '../../../../claim/index'
import { THRESHOLD, agreement } from '../../../../claim/match'
import corpus from '../../../../evidence/data/02-invoice-corpus.json' with { type: 'json' }

export type Row = {
  label: string
  agreed: number
  collides: boolean
  /** True for the entry that is a different receivable, not a rendering of the same one. */
  expectNoMatch: boolean
}

type Variant = Record<string, string> & { label: string; expectNoMatch?: boolean }

/**
 * What the registry would do with the same receivable written differently.
 *
 * This never reaches the chain, and saying so is part of the row. The ledger pins the invoice
 * number, the amount, the currency and the due date before the collision check is ever consulted,
 * and the enclave replaces the debtor, the issuer and the country with the book's own values — so
 * a reformatted claim is refused earlier, for a different reason, and the tolerance below is what
 * the index would have said had it been asked.
 *
 * Scored with the matcher the enclave imports, not with a copy of it.
 */
export const reformattingRows = (): Row[] => {
  const canonical = corpus.canonical as unknown as Record<string, string>
  const base = toComponents(ClaimType.Invoice, canonical as never)

  return (corpus.variants as unknown as Variant[]).map((variant) => {
    // Two keys describe the entry rather than override the claim, and one records where the
    // corpus row came from. None of them belongs in the components being scored.
    const overrides = Object.fromEntries(
      Object.entries(variant).filter(
        ([key]) => key !== 'label' && key !== 'expectNoMatch' && !key.startsWith('_'),
      ),
    )
    const { label, expectNoMatch } = variant
    const agreed = agreement(base, toComponents(ClaimType.Invoice, { ...canonical, ...overrides } as never))
    return { label, agreed, collides: agreed >= THRESHOLD, expectNoMatch: expectNoMatch === true }
  })
}
