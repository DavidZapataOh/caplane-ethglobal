export type Deliverable = {
  readonly id: number
  readonly label: string
  readonly href: string
  readonly category: 'bounty' | 'thesis' | 'differentiator'
}

// The 12 deliverables PROYECTO.md §20.3 defines as done-when for Sprint 06.
export const DELIVERABLES: readonly Deliverable[] = [
  { id: 1, label: 'Landing', href: '/', category: 'bounty' },
  { id: 2, label: 'App', href: 'https://app.caplane.xyz', category: 'bounty' },
  { id: 3, label: 'Backend', href: 'https://api.caplane.xyz/health', category: 'bounty' },
  { id: 4, label: 'Architecture diagram', href: '/architecture.svg', category: 'bounty' },
  { id: 5, label: 'Video', href: 'https://REPLACE_WITH_REAL_ID', category: 'bounty' },
  { id: 6, label: 'Registry lookup', href: 'https://registry.caplane.xyz', category: 'thesis' },
  { id: 7, label: 'SDK', href: 'https://www.npmjs.com/package/caplane-sdk', category: 'thesis' },
  { id: 8, label: 'MCP server', href: 'https://mcp.caplane.xyz', category: 'differentiator' },
  { id: 9, label: 'Docs', href: 'https://docs.caplane.xyz', category: 'differentiator' },
  {
    id: 10,
    label: 'Evidence',
    href: 'https://github.com/REPLACE_ORG/caplane/tree/main/evidence',
    category: 'differentiator',
  },
  {
    id: 11,
    label: 'Threat model',
    href: 'https://github.com/REPLACE_ORG/caplane/blob/main/THREATMODEL.md',
    category: 'differentiator',
  },
  { id: 12, label: 'Adversarial harness', href: 'https://REPLACE_WITH_HARNESS_PANEL_URL', category: 'differentiator' },
] as const

export function assertDeliverablesComplete(list: readonly Deliverable[]): void {
  if (list.length !== 12) throw new Error(`expected 12 deliverables, got ${list.length}`)
  for (const d of list) {
    if (!d.href || d.href.trim() === '') throw new Error(`deliverable ${d.id} (${d.label}) has no href`)
    if (d.href.includes('REPLACE_')) {
      throw new Error(`deliverable ${d.id} (${d.label}) still has a placeholder href: ${d.href}`)
    }
  }
}

// The project's hard three-sponsor limit (CONVENTIONS.md) — Chainlink, Arc, Privy, no more.
export const SPONSOR_SCOPE = ['chainlink', 'arc', 'privy'] as const
export type Sponsor = (typeof SPONSOR_SCOPE)[number]

export function assertSponsorScope(list: readonly string[]): void {
  if (list.length !== 3) throw new Error(`sponsor scope must have exactly 3 entries, got ${list.length}`)
  for (const s of list) {
    if (!(SPONSOR_SCOPE as readonly string[]).includes(s)) throw new Error(`"${s}" is outside the 3-sponsor scope`)
  }
}

export type EvidenceEntry = {
  readonly id: 'contracts' | 'tests' | 'cycle' | 'fmr'
  readonly headline: string
  readonly detail: string
  readonly proofHref: string
}

const REGISTRY_ADDRESS = '0xe7170ee0ce4cab4593970ef5c4ebf7d0d62ae19b'

// Every number here is cited in CAPLANE-COMPLETO.md — none is estimated.
export const EVIDENCE: readonly EvidenceEntry[] = [
  {
    id: 'contracts',
    headline: '4 contracts, verified, no owner',
    detail:
      'CaplaneRegistry, CaplaneInbox, CaplanePool, CaplaneEscrow — full-match verified on Arc Testnet. None has an owner, a pause, or an upgrade path.',
    proofHref: `https://testnet.arcscan.app/address/${REGISTRY_ADDRESS}#code`,
  },
  {
    id: 'tests',
    headline: '295 tests, 100% branch coverage',
    detail: '138 contract tests plus 157 unit tests, every branch of all four contracts covered.',
    proofHref: 'https://github.com/REPLACE_ORG/caplane/tree/main/evidence/test-count.json',
  },
  {
    id: 'cycle',
    headline: 'One full cycle, already on chain',
    detail:
      'A lien was recorded at block 61,685,965, a second submission was rejected 7-of-7 for collision, and the first lien was released at block 61,687,960.',
    proofHref: `https://testnet.arcscan.app/address/${REGISTRY_ADDRESS}#events`,
  },
  {
    id: 'fmr',
    headline: 'Fuzzy match, measured: 0.111%',
    detail:
      "Across 43 real invoices from Xero's Demo Company (903 pairs), the false-match rate at the shipped threshold is 0.111% (95% CI upper bound 0.524%).",
    proofHref: 'https://github.com/REPLACE_ORG/caplane/tree/main/evidence/claim/09-rates.txt',
  },
] as const

export function assertEvidenceReal(list: readonly EvidenceEntry[]): void {
  for (const e of list) {
    for (const field of [e.headline, e.detail, e.proofHref] as const) {
      if (field.trim() === '' || field.includes('REPLACE_')) {
        throw new Error(`evidence entry "${e.id}" has a placeholder or empty field: "${field}"`)
      }
    }
  }
}

export { REGISTRY_ADDRESS }

export type Audience = 'business' | 'financier' | 'developer'

export function commandFor(audience: Audience, registryAddress: string): string {
  switch (audience) {
    case 'business':
      return '! grep -q onlyOwner contracts/src/CaplaneRegistry.sol && echo "no owner, no admin, no pause"'
    case 'financier':
      return `https://testnet.arcscan.app/address/${registryAddress}#readContract`
    case 'developer':
      return [
        'npm install caplane-sdk',
        '',
        "import { createCaplaneClient } from 'caplane-sdk'",
        `const client = createCaplaneClient({ rpcUrls: [RPC_URL], registry: '${registryAddress}', quorum: true })`,
        'await client.statusOf(lienId)',
      ].join('\n')
  }
}
