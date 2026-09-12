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

## Deployed on Arc Testnet

| Contract | Address |
|---|---|
| `CaplaneInbox` | [`0x14f3bbf3b21b0411f798aa50edd05df06e72ae88`](https://testnet.arcscan.app/address/0x14f3bbf3b21b0411f798aa50edd05df06e72ae88) |
| `CaplaneRegistry` | [`0xf2de8798750ea3bcb0faca049fc7581a118ef1f6`](https://testnet.arcscan.app/address/0xf2de8798750ea3bcb0faca049fc7581a118ef1f6) |
| `CaplanePool` | [`0xa7ec42984bfc9f0024ca0873721e8b1166c2b0ee`](https://testnet.arcscan.app/address/0xa7ec42984bfc9f0024ca0873721e8b1166c2b0ee) |
| `CaplaneEscrow` | [`0x5de99d8be27468dd175738e1703259130eb703b5`](https://testnet.arcscan.app/address/0x5de99d8be27468dd175738e1703259130eb703b5) |

Source is verified, so the explorer's read tab works without an account: open the registry and
call `isEncumbered(bytes32)` on any commitment. It answers from chain state — there is no server
in the path, and nothing to ask permission from.

Nobody can alter an entry, including us. The registry has no owner, no pause and no upgrade path,
and its only writer is a DON-consensused report from an attested enclave:

```bash
! grep -q onlyOwner contracts/src/CaplaneRegistry.sol && echo "no owner, no admin, no pause"
```

The workflow name is hashed into the registry as an immutable and reads back as
`0x33396465656661623966` — `caplane-registry`. Deployment cost, addresses, the compile profile
and what is deliberately still zero are in `evidence/deploy/06-contracts.txt`.

## Attribution

This product uses the International Trade Administration's Data API but is not endorsed or
certified.

## License

MIT
