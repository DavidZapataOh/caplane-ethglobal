/**
 * Seals a claim read from stdin and writes the envelope as hex to stdout.
 *
 * Sealing needs randomness, which the enclave does not have, so it happens out here. What goes
 * in is a claim document; what comes out is what a submission carries as calldata.
 *
 *   bun run tools/seal-cli.ts --to <enclavePublicKey> --from <authorizedSubmitter> < claim.json
 */
import { seal } from '../envelope'

const flag = (name: string): string => {
	const at = process.argv.indexOf(`--${name}`)
	const value = at === -1 ? undefined : process.argv[at + 1]
	if (value === undefined) throw new Error(`missing --${name}`)
	return value
}

const bytes = (hex: string): Uint8Array =>
	Uint8Array.from(Buffer.from(hex.replace(/^0x/, ''), 'hex'))

const recipientPublicKey = bytes(flag('to'))
if (recipientPublicKey.length !== 32) throw new Error('--to is not a 32-byte public key')

// Lowercased before the bytes are taken: the enclave compares against a trimmed event topic,
// which is lowercase, and a checksummed address would seal to different bytes.
const authorizedSubmitter = bytes(flag('from').toLowerCase())
if (authorizedSubmitter.length !== 20) throw new Error('--from is not a 20-byte address')

const claim = await Bun.stdin.text()
if (claim.trim() === '') throw new Error('no claim on stdin')

const envelope = seal(new TextEncoder().encode(claim.trim()), recipientPublicKey, authorizedSubmitter)
process.stdout.write(`0x${Buffer.from(envelope).toString('hex')}\n`)
