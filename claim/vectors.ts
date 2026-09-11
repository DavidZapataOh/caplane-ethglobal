/**
 * Fixed vectors, derived from an invoice seeded in a real accounting system rather than from
 * round numbers. They are literals on purpose: regenerating them whenever the code changes
 * would make them prove nothing. A failure here means a derivation moved, and a derivation
 * that moves after the first lien exists cannot be reindexed — the pepper does not rotate.
 *
 * `testPepper` is published and is not the production one, which never leaves the enclave.
 * What these prove is that the derivation is correct and deterministic, not that the
 * production pepper was the one used; only a real execution shows that.
 */
export const VECTORS = {
  "testPepper": [
    42,
    42,
    42,
    42,
    42,
    42,
    42,
    42,
    42,
    42,
    42,
    42,
    42,
    42,
    42,
    42,
    42,
    42,
    42,
    42,
    42,
    42,
    42,
    42,
    42,
    42,
    42,
    42,
    42,
    42,
    42,
    42
  ],
  "invoice": {
    "components": {
      "debtorTaxId": "11000111000",
      "invoiceNumber": "ORC1043",
      "amountBucket": "24",
      "dueDate": "2026-12-31",
      "currency": "AUD",
      "issuerTaxId": "E1218A28743747ECBFB5252092825083",
      "country": "AU"
    },
    "lienId": "0xf84b7a4a3620bb18f5486af09e223c7273d3d6118acda3b4b322a6f037403900",
    "commitments": [
      "0x7fe06f21c37c947f5bb033166b40969d9d5b6d03fbd51e44acd75d232c642c1b",
      "0x8847a3f022c214b1a1bf561141a83c88743735ae925b1bcaa704493130256762",
      "0xd131ee2c4c380931bf43c22bbb207dffb5bc4a86df10474746d74d859deb1ad0",
      "0x65ed4772dfd67f8394ef6775fc611d901eae658f39e81e91c4682952473b9d53",
      "0x471cf8810873a4b405f7dbb9054ab86edb77910c57bdf861af2d14e35bcbb219",
      "0xa192b3319758f0de5489ddb014293f128f387b35bce8b63bbafbf2d6fdfa93b4",
      "0xff306f7e552c92eafb81b35b9e71066896a624bbb3c6e75e8a0d89a6f7c8525c"
    ]
  }
} as const
