/**
 * Emits the envelope vector both packages are held to. Run once; the output is committed and
 * becomes the contract between the sealing side and the opening side, so neither can drift
 * without the other going red.
 *
 * The recipient keypair here is THROWAWAY and generated on the spot. It is never the enclave's:
 * generating the vector against the published key would put the enclave's private half into a
 * committed JSON, and the credential rule would not catch it — it only knows the names
 * PRIVATE_KEY, SECRET_KEY, API_KEY, API_TOKEN and MNEMONIC.
 */
import { x25519 } from '@noble/curves/ed25519.js'
import { AUTHORIZED_SUBMITTER_BYTES, seal } from '../envelope'

const hex = (b: Uint8Array) => `0x${Buffer.from(b).toString('hex')}`
const fixed = (byte: number, length: number) => new Uint8Array(length).fill(byte)

const recipientSecret = x25519.utils.randomSecretKey()
const otherRecipientSecret = x25519.utils.randomSecretKey()
const ephemeralSecret = fixed(0x07, 32)
const nonce = fixed(0x09, 24)

const authorizedSubmitter = Uint8Array.from(
	Buffer.from('86Ec9f04485Db066CF155353f15eef356Ae90253'.toLowerCase(), 'hex'),
)
if (authorizedSubmitter.length !== AUTHORIZED_SUBMITTER_BYTES) {
	throw new Error('the authorized submitter is not twenty bytes')
}

const plaintext = 'caplane envelope vector v1'
const realisticClaim = JSON.stringify({
	debtorTaxId: 'Bayside Club',
	invoiceNumber: 'ORC1043',
	amountMinor: '27500000',
	currency: 'AUD',
	dueDate: '2026-12-31',
	issuerTaxId: 'e1218a28-7437-47ec-bfb5-252092825083',
	country: 'AU',
})

const envelope = seal(
	new TextEncoder().encode(plaintext),
	x25519.getPublicKey(recipientSecret),
	authorizedSubmitter,
	ephemeralSecret,
	nonce,
)

console.log(
	JSON.stringify(
		{
			canonical: {
				recipientPublicKey: hex(x25519.getPublicKey(recipientSecret)),
				recipientSecret: hex(recipientSecret),
				otherRecipientSecret: hex(otherRecipientSecret),
				ephemeralSecret: hex(ephemeralSecret),
				nonce: hex(nonce),
				authorizedSubmitter: hex(authorizedSubmitter),
				// How the same address arrives on the event: left-padded to a 32-byte topic.
				submitterTopic: `0x${'00'.repeat(12)}${Buffer.from(authorizedSubmitter).toString('hex')}`,
				plaintext,
				realisticClaim,
				envelope: hex(envelope),
			},
		},
		null,
		2,
	),
)
