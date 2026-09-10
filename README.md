# Caplane

An encrypted lien registry, writable only from inside a TEE.

Two package managers by design: `caplane-workflow/` uses Bun because the
Chainlink CRE SDK requires it; everything else uses npm. Each directory
installs independently — there is no workspace linkage.

## Toolchain

Pinned so a clean machine reproduces this build:

| Tool | Version |
|---|---|
| Node | 22 LTS |
| Bun | 1.2.21 |
| Foundry | `circlefin/arc-foundry` v0.8.0-1, pinned by sha256 |
| solc | 0.8.28 |
| `cre` CLI | 1.33.0 |

## Layout

| Directory | What |
|---|---|
| `contracts/` | Solidity, Foundry |
| `caplane-workflow/` | Chainlink CRE confidential workflow |
| `claim/` | Claim encoding, shared by the workflow and the SDK |
| `sdk/` | `@caplane/sdk` |
| `web/` · `site/` | Next.js surfaces |
| `services/` | api, mcp, adversarial harness |
| `scripts/` | Repository gates and live dependency probes |
| `evidence/` | Reproducible execution artifacts |

## Attribution

This product uses the International Trade Administration's Data API but is not endorsed or
certified.

## License

MIT
