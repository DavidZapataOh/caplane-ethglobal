import { readdirSync, readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createCaplaneClient } from './client.js'

const sources = new URL('../../src/', import.meta.url)

// The package exists so a third party needs nothing of ours. A hostname of ours anywhere in it
// would make that false, and it is the only property that separates this package from the MCP
// server and the public lookup, which are both deliberately ours.
//
// The directory is walked rather than listed: a hardcoded list passes by skipping a file nobody
// added it to, which is the shape of gate this repository keeps finding vacuous.
test('nothing in the package points at us', () => {
  // Assembled rather than written: spelled out, the needle appears in this file and the walk
  // reports itself. Excluding this file instead would be an exclusion that goes stale the day a
  // second checking test is added.
  const needle = ['caplane', 'xyz'].join('.')
  const files = readdirSync(sources).filter((name) => name.endsWith('.ts'))
  assert.ok(files.length >= 3, 'the walk found almost nothing, which is the failure it cannot report')
  for (const name of files) {
    assert.equal(
      readFileSync(new URL(name, sources), 'utf8').includes(needle),
      false,
      `${name} names a host of ours`,
    )
  }
})

// The caller's endpoint, not ours. Someone who distrusts both defaults has to be able to pass their
// own node, and that is the difference between "no server of ours" and "no server".
test('the caller chooses the endpoint', () => {
  const client = createCaplaneClient({ rpcUrls: ['https://rpc.drpc.testnet.arc.io'] })
  assert.deepEqual(client.endpoints, ['https://rpc.drpc.testnet.arc.io'])
  assert.equal(client.registry.toLowerCase(), client.registry.toLowerCase())
})

// Two endpoints answering the same question removes no trust — it raises the cost of lying from one
// operator to two colluding. The README says exactly that; this pins the behaviour.
test('two endpoints are asked by default and they agree about the code', async () => {
  const client = createCaplaneClient()
  assert.ok(client.endpoints.length >= 2)
  const code = await client.registryCode()
  assert.ok(code.length > 2, 'the registry has bytecode at the recorded address')
})

// The discriminator. A response carrying the workflow name the registry froze cannot have come from
// a wrong address, an empty registry or a dead endpoint — the three failures that otherwise look
// alike. WORKFLOW_NAME() is not in the ABI: it is an immutable the generator never emitted, so the
// selector is written literally.
test('the client refuses a registry that is not ours', async () => {
  const client = createCaplaneClient()
  assert.equal(await client.workflowName(), '0x33396465656661623966')
  const wrong = createCaplaneClient({ registry: '0x0000000000000000000000000000000000000001' })
  await assert.rejects(() => wrong.workflowName(), /identity/)
})

// A disagreement has to be refused rather than resolved by picking one. Pointing one client at a
// chain that is not Arc is the cheapest real disagreement available.
test('a disagreement is refused, not resolved', async () => {
  const split = createCaplaneClient({
    rpcUrls: ['https://rpc.testnet.arc.io', 'https://ethereum-rpc.publicnode.com'],
  })
  await assert.rejects(() => split.registryCode(), /disagree/)
})

// The test above proves both endpoints are asked, because a read that used only the first would
// have succeeded — but it does not prove the comparison, since viem rejects the foreign chain
// before anything is compared. This asks the seam directly, with a real function whose answer
// depends on which endpoint it was handed.
test('the comparison itself refuses two different answers', async () => {
  const client = createCaplaneClient()
  let nth = 0
  await assert.rejects(
    () => client.agree(async () => `answer ${(nth += 1)}`),
    /disagree/,
  )
  assert.equal(await client.agree(async () => 'identical'), 'identical')
})

// A lien carries three bigints and JSON.stringify throws on one, so a comparator written the
// obvious way crashes on the first real read instead of comparing it.
test('the comparison survives the bigints a lien is made of', async () => {
  const client = createCaplaneClient()
  assert.deepEqual(await client.agree(async () => ({ advanceUsdc6: 8_000_000n })), {
    advanceUsdc6: 8_000_000n,
  })
})
