import { ClaimType } from '../abi/frozen'
import { expect, test } from 'bun:test'
import { toComponents } from '../index'
import { agreement, THRESHOLD } from '../match'
import type { ClaimInput } from '../schema'

// Not a rate, and the plan refuses to call it one. A pair that must match is the same invoice
// as a second lender would transcribe it, and there is no second lender: these renderings are
// ours. Each carries a documented reason, and exactly one was produced by the ledger.
type Rendering = { label: string; author: 'us' | 'ledger'; over: Partial<ClaimInput> }

const SEEDED: ClaimInput = {
  debtorTaxId: '11 000 111 000',
  invoiceNumber: 'ORC1043',
  amountMinor: '27500000',
  currency: 'AUD',
  dueDate: '2026-12-31',
  issuerTaxId: 'e1218a28-7437-47ec-bfb5-252092825083',
  country: 'AU',
}

export const RENDERINGS: Rendering[] = [
  { label: 'separators in the identifier', author: 'us', over: { debtorTaxId: '11000111000' } },
  { label: 'invoice number without its prefix', author: 'us', over: { invoiceNumber: '1043' } },
  { label: 'day-first date', author: 'us', over: { dueDate: '31/12/2026' } },
  { label: 'lowercase country', author: 'us', over: { country: 'au' } },
  { label: 'identifier with a country prefix', author: 'us', over: { debtorTaxId: 'AU 11 000 111 000' } },
  // The only one we did not invent: the ledger carries both figures for this invoice.
  { label: 'the net line instead of the taxed total', author: 'ledger', over: { amountMinor: '25000000' } },
]

const base = toComponents(ClaimType.Invoice, SEEDED)
const score = (over: Partial<ClaimInput>) => agreement(base, toComponents(ClaimType.Invoice, { ...SEEDED, ...over }))

test('every documented rendering survives the threshold', () => {
  const below = RENDERINGS.filter((r) => score(r.over) < THRESHOLD).map((r) => r.label)
  expect(below).toEqual([])
})

// The one the ledger produced rather than us, asserted on its own: it is the only evidence
// here that is not our imagination.
test("the ledger's own net and gross figures are the same claim", () => {
  expect(score({ amountMinor: '25000000' })).toBeGreaterThanOrEqual(THRESHOLD)
})

test('the demonstration reports how many renderings, and how many are ours', () => {
  expect(RENDERINGS).toHaveLength(6)
  expect(RENDERINGS.filter((r) => r.author === 'ledger')).toHaveLength(1)
})
