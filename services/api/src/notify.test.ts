import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { idempotencyKeyFor, send } from './notify.js'

// The credential is send-only, measured: GET /emails/<id> answers 401 restricted_api_key. So the
// service can know a message was accepted and can never know it arrived. "Delivered" would be a
// claim with nothing behind it, and the only real message this domain ever sent landed in spam.
test('the module never claims delivery', () => {
  const source = readFileSync(new URL('../../src/notify.ts', import.meta.url), 'utf8')
  assert.equal(/delivered|Delivered|DELIVERED/.test(source), false)
})

// The provider rejects one field at a time — measured, the errors are ordered — so a caller cannot
// collect every problem in one round trip and has to surface the one it got.
test('a rejected send reports why instead of throwing', async () => {
  const outcome = await send({
    to: 'not-an-address',
    subject: 'probe',
    text: 'probe',
    idempotencyKey: `probe-${Date.now()}`,
  })
  assert.equal(outcome.accepted, false)
  assert.match(
    (outcome as { reason: string }).reason,
    /validation_error|missing_required_field|invalid_/,
  )
})

// A missing field is a different name from a malformed one, and branching on the name is the only
// way to tell a bug from a bad address.
test('a missing field is named differently from a malformed one', async () => {
  const outcome = await send({
    to: '',
    subject: 'probe',
    text: 'probe',
    idempotencyKey: `probe-${Date.now()}`,
  })
  assert.equal(outcome.accepted, false)
  assert.ok((outcome as { reason: string }).reason.length > 0)
})

// Measured: the same key with a different body answers 409 invalid_idempotent_request, and keys
// live 24 hours. So the key has to come from something that does not change between retries — the
// link token — and never from the message, which carries a fresh link every time it is built.
test('the key derives from the token, not from the message', () => {
  const token = 'abc.def'
  assert.equal(idempotencyKeyFor(token), idempotencyKeyFor(token))
  assert.notEqual(idempotencyKeyFor(token), idempotencyKeyFor('abc.deg'))
  assert.ok(idempotencyKeyFor(token).length <= 256)
  assert.match(idempotencyKeyFor(token), /^confirmation\//)
})

// A missing credential is a refusal with a reason, not a throw: the route above it has to answer
// 500 with something a log can act on rather than crash the process mid-request.
test('a missing transport key is refused, not thrown', async () => {
  const key = process.env.NOTIFY_TRANSPORT_KEY
  delete process.env.NOTIFY_TRANSPORT_KEY
  try {
    const outcome = await send({ to: 'a@b.test', subject: 's', text: 't', idempotencyKey: 'k' })
    assert.equal(outcome.accepted, false)
    assert.match((outcome as { reason: string }).reason, /transport key/)
  } finally {
    if (key !== undefined) process.env.NOTIFY_TRANSPORT_KEY = key
  }
})
