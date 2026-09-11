import { $ } from 'bun'
import { expect, test } from 'bun:test'

// The bar is not that it runs. It is that the bytes are the same in a runtime with no ICU,
// where anything locale-aware silently returns something else and nothing fails.
//
// The SDK's own validator already refuses what throws — node:crypto, fetch, setTimeout — and
// for that class it is cheaper than any test. This covers what it cannot see.
test(
  'the enclave runtime derives the same commitments, byte for byte',
  async () => {
    const native = await $`bun run tools/probe.ts`.text()
    const enclave = await $`bun run derive:wasm`.text()
    expect(JSON.parse(enclave)).toEqual(JSON.parse(native))
  },
  60_000,
)
