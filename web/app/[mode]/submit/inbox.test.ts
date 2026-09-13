import assert from 'node:assert/strict'
import { test } from 'node:test'
import { keccak256, encodePacked } from 'viem'
import { ARC, INBOX, submissionIdOf } from './inbox.ts'

// The inbox reverts `WrongSubmissionId` unless the first argument is exactly
// keccak256(abi.encodePacked(msg.sender, ciphertext)). Deriving it any other way is a transaction
// that costs gas and reverts.
test('the submission id is the packed hash of sender and ciphertext', () => {
  const sender = '0x86Ec9f04485Db066CF155353f15eef356Ae90253' as const
  const ciphertext = '0xdeadbeef' as const
  assert.equal(
    submissionIdOf(sender, ciphertext),
    keccak256(encodePacked(['address', 'bytes'], [sender, ciphertext])),
  )
})

test('the addresses are read from the deployment file, never retyped', () => {
  assert.equal(INBOX.toLowerCase(), '0xc5218fd1b6eb7c91f905871301bf8620bc8baf91')
  assert.equal(ARC.enclavePublicKey.length, 66)
  assert.equal(ARC.chainIdHex, '0x4cef52')
})
