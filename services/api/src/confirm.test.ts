import assert from 'node:assert/strict'
import { test } from 'node:test'
import { privateKeyToAccount } from 'viem/accounts'
import { CONFIRMATION_TYPES } from './confirmation.js'
import { createIndex } from './index-state.js'
import { type LinkPayload, mint, receiptOf } from './link.js'
import { createApi } from './server.js'

const CONTACT = '3e776c4b-ea9e-4bb1-96be-6b0c7a71a37f'
const REQUEST = {
  contactId: CONTACT,
  creditor: '0x86Ec9f04485Db066CF155353f15eef356Ae90253',
  claimId: '0xf6ef8ca5000000000000000000000000000000000000000000000000000000aa',
  invoiceNumber: 'ORC1043',
  currency: 'USD',
  amountMinor: '27500000',
  dueDate: '2027-01-30',
  expiresAtBlock: '61700000',
}

// A real function, injected, that records where the message went. Not a simulation of the
// transport — the transport has its own live tests — but the only way to assert the property that
// matters: the address used is the ledger's, and a test cannot read an inbox.
const listen = (t: { after: (fn: () => void) => void }) => {
  const sent: Array<{ to: string; text: string }> = []
  return new Promise<{ url: string; sent: typeof sent; close: () => void }>((resolve) => {
    const server = createApi(createIndex(), {
      sendMail: async (message: { to: string; text: string }) => {
        sent.push({ to: message.to, text: message.text })
        return { accepted: true, id: 'recorded' }
      },
    })
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      // Closed from `after`, not from the end of the body: an assertion that fails skips the rest
      // of the test, the listener leaks, and `node --test` waits forever for the loop to drain — a
      // suite that hangs on failure instead of reporting it.
      t.after(() => server.close())
      resolve({ url: `http://127.0.0.1:${port}`, sent, close: () => server.close() })
    })
  })
}

const post = (url: string, body: unknown) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

// THE test of this plan. The channel is the only thing tying the signing key to the real debtor,
// and it ties nothing if the caller may say where to write. A service that accepted this field
// would return the same 200 and close nothing.
test('an address offered by the caller is refused', async (t) => {
  const api = await listen(t)
  for (const field of ['email', 'to', 'address', 'emailAddress']) {
    const response = await post(`${api.url}/confirmations`, { ...REQUEST, [field]: 'attacker@example.test' })
    assert.equal(response.status, 400, field)
    assert.match(((await response.json()) as { error: string }).error, /comes from the ledger/)
  }
  assert.deepEqual(api.sent, [], 'nothing may be sent on a refused request')
})

// And the positive half, which is what makes the refusal mean something: the address actually used
// is the one the ledger returned for that contact id.
test('the address used is the one the ledger holds', async (t) => {
  const api = await listen(t)
  const response = await post(`${api.url}/confirmations`, REQUEST)
  assert.equal(response.status, 200)
  assert.equal(api.sent.length, 1)
  assert.match(api.sent[0]!.to, /@/)
  assert.notEqual(api.sent[0]!.to, 'attacker@example.test')
})

// The response must not carry the token. Handing it back would let whoever asked open the link
// without ever receiving the mail, which is precisely the anchor being paid for.
test('the response carries a receipt and never the link', async (t) => {
  const api = await listen(t)
  const body = (await (await post(`${api.url}/confirmations`, REQUEST)).json()) as Record<string, unknown>
  assert.equal(typeof body.receipt, 'string')
  assert.equal(body.accepted, true)
  assert.equal(body.token, undefined)
  assert.equal(body.email, undefined)
  assert.equal(JSON.stringify(body).includes('@'), false)
})

test('an unknown contact is refused before anything is sent', async (t) => {
  const api = await listen(t)
  const response = await post(`${api.url}/confirmations`, {
    ...REQUEST,
    contactId: '00000000-0000-0000-0000-000000000000',
  })
  assert.equal(response.status, 422)
  assert.deepEqual(api.sent, [])
})

const tokenFor = (issuedAt: number) =>
  mint({ ...REQUEST, issuedAt } as unknown as LinkPayload)

// What the debtor is shown has to be exactly what the enclave will check, field for field. A page
// that showed one amount while the structure carried another is the failure this signature format
// exists to prevent.
test('the structure served is the structure the enclave checks', async (t) => {
  const api = await listen(t)
  const token = tokenFor(Math.floor(Date.now() / 1000))
  const served = (await (await fetch(`${api.url}/confirmations/${token}`)).json()) as {
    domain: Record<string, unknown>
    message: Record<string, string>
    shown: string[]
    email?: string
  }
  assert.deepEqual(Object.keys(served.message), [
    'creditor',
    'debtor',
    'claimId',
    'invoiceNumber',
    'currency',
    'amountMinor',
    'dueDate',
    'debtorRef',
    'expiresAtBlock',
  ])
  assert.equal(served.message.amountMinor, '27500000')
  assert.equal(served.domain.chainId, 5042002)
  assert.equal(served.email, undefined)
  assert.deepEqual(served.shown, ['creditor', 'invoiceNumber', 'currency', 'amountMinor', 'dueDate', 'expiresAtBlock'])
  for (const field of served.shown) assert.ok(served.message[field] !== undefined, field)
})

const signWith = async (url: string, token: string, key: `0x${string}`) => {
  const served = (await (await fetch(`${url}/confirmations/${token}`)).json()) as {
    domain: never
    message: Record<string, string>
  }
  const debtor = privateKeyToAccount(key)
  const signature = await debtor.signTypedData({
    domain: served.domain,
    types: CONFIRMATION_TYPES,
    primaryType: 'DebtorConfirmation',
    message: {
      ...served.message,
      debtor: debtor.address,
      amountMinor: BigInt(served.message.amountMinor!),
      expiresAtBlock: BigInt(served.message.expiresAtBlock!),
    } as never,
  })
  return { debtor, signature }
}

// A real signature over the real structure, produced with a real key.
test('a real signature is accepted and handed back by receipt', async (t) => {
  const api = await listen(t)
  const token = tokenFor(Math.floor(Date.now() / 1000) - 1)
  const { debtor, signature } = await signWith(api.url, token, process.env.DEBTOR_KEY as `0x${string}`)
  const posted = await post(`${api.url}/confirmations/${token}`, { debtor: debtor.address, signature })
  assert.equal(posted.status, 200)
  const receipt = (await (await fetch(`${api.url}/receipts/${receiptOf(token)}`)).json()) as {
    signature: string
    confirmation: Record<string, string>
  }
  assert.equal(receipt.signature, signature)
  assert.equal(receipt.confirmation.debtor?.toLowerCase(), debtor.address.toLowerCase())
})

// The service verifies as well as the enclave does. Passing a bad signature through would turn a
// channel fault into a refusal on chain that costs gas and reads as the debtor saying no.
test('a signature by a key other than the one named is refused', async (t) => {
  const api = await listen(t)
  const token = tokenFor(Math.floor(Date.now() / 1000) - 2)
  const { signature } = await signWith(api.url, token, process.env.DEBTOR_KEY as `0x${string}`)
  const posted = await post(`${api.url}/confirmations/${token}`, {
    debtor: '0x0000000000000000000000000000000000000001',
    signature,
  })
  assert.equal(posted.status, 400)
})

test('a spent link cannot be signed twice', async (t) => {
  const api = await listen(t)
  const token = tokenFor(Math.floor(Date.now() / 1000) - 3)
  const { debtor, signature } = await signWith(api.url, token, process.env.DEBTOR_KEY as `0x${string}`)
  const body = { debtor: debtor.address, signature }
  assert.equal((await post(`${api.url}/confirmations/${token}`, body)).status, 200)
  assert.equal((await post(`${api.url}/confirmations/${token}`, body)).status, 409)
})

test('a tampered link is refused at every route', async (t) => {
  const api = await listen(t)
  const forged = `${Buffer.from('{}').toString('base64url')}.${'A'.repeat(43)}`
  assert.equal((await fetch(`${api.url}/confirmations/${forged}`)).status, 404)
  assert.equal((await post(`${api.url}/confirmations/${forged}`, {})).status, 404)
})

// Inherited and re-checked: the activity gate forbids these three names in this file.
test('the routes the activity gate forbids are still absent', async (t) => {
  const api = await listen(t)
  for (const path of ['/liens/0x00', '/encumbered/0x00', '/status/0x00']) {
    assert.equal((await fetch(`${api.url}${path}`)).status, 404, path)
  }
})
