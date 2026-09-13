import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bearerToken } from './privy.ts'

const withHeader = (value?: string) =>
  new Request('https://caplane.test/api/organizations', {
    method: 'POST',
    headers: value === undefined ? {} : { authorization: value },
  })

test('reads the access token out of a bearer header', () => {
  assert.equal(bearerToken(withHeader('Bearer abc.def.ghi')), 'abc.def.ghi')
})

test('has no token when the header is absent', () => {
  assert.equal(bearerToken(withHeader()), undefined)
})

test('does not read a token out of a scheme it was not sent under', () => {
  assert.equal(bearerToken(withHeader('Basic abc.def.ghi')), undefined)
})

test('an empty bearer header carries no token', () => {
  assert.equal(bearerToken(withHeader('Bearer ')), undefined)
})
