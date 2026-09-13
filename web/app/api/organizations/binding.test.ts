import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bindWallet, openBinding } from './binding.ts'

const KEY = 'a'.repeat(32)

test('a binding opens back to the wallet it was minted for', () => {
  const token = bindWallet({ userId: 'did:privy:u1', walletId: 'w1' }, KEY)
  assert.deepEqual(openBinding(token, KEY), { userId: 'did:privy:u1', walletId: 'w1' })
})

test('a binding minted for one user does not open for another', () => {
  // The whole point: a signed-in visitor must not be able to name someone else's wallet. The
  // caller never supplies the wallet id — it comes out of a token only this server can mint.
  const token = bindWallet({ userId: 'did:privy:u1', walletId: 'w1' }, KEY)
  const opened = openBinding(token, KEY)
  assert.notEqual(opened?.userId, 'did:privy:u2')
})

test('a tampered body is refused, not read', () => {
  const token = bindWallet({ userId: 'did:privy:u1', walletId: 'w1' }, KEY)
  const [, mac] = token.split('.')
  const forged = `${Buffer.from(JSON.stringify({ userId: 'did:privy:u2', walletId: 'w9' })).toString('base64url')}.${mac}`
  assert.equal(openBinding(forged, KEY), undefined)
})

test('a token signed with another key is refused', () => {
  const token = bindWallet({ userId: 'did:privy:u1', walletId: 'w1' }, KEY)
  assert.equal(openBinding(token, 'b'.repeat(32)), undefined)
})

test('a malformed token is refused rather than throwing', () => {
  for (const bad of ['', '.', 'nodot', 'a.', '.b']) {
    assert.equal(openBinding(bad, KEY), undefined, `${bad} should not open`)
  }
})
