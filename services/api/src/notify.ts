import { createHash } from 'node:crypto'

const FROM = 'Caplane <noreply@caplane.xyz>'

/**
 * Measured: the same key with a changed body answers 409 `invalid_idempotent_request`, and keys live
 * twenty-four hours. So it has to derive from something stable across retries. The link token is;
 * the message body is not, because it is rebuilt each time.
 */
export const idempotencyKeyFor = (token: string): string =>
  `confirmation/${createHash('sha256').update(token).digest('hex').slice(0, 32)}`

export type SendOutcome = { accepted: true; id: string } | { accepted: false; reason: string }

/**
 * Hands one message to the transport.
 *
 * `accepted` means the provider took it for sending. It does not mean anyone received it, and this
 * module cannot find out: the credential is send-only — measured, the read route answers 401
 * `restricted_api_key` — and the one real message this domain has ever sent landed in spam with
 * DKIM, SPF and DMARC all published. That is reputation, not configuration, and no DNS record
 * fixes it.
 */
export const send = async (options: {
  to: string
  subject: string
  text: string
  idempotencyKey: string
}): Promise<SendOutcome> => {
  const key = process.env.NOTIFY_TRANSPORT_KEY
  if (key === undefined || key === '') return { accepted: false, reason: 'transport key is not set' }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      'Idempotency-Key': options.idempotencyKey.slice(0, 256),
    },
    body: JSON.stringify({ from: FROM, to: [options.to], subject: options.subject, text: options.text }),
  })
  const body = (await response.json().catch(() => ({}))) as {
    id?: string
    name?: string
    message?: string
  }
  if (!response.ok || body.id === undefined) {
    return { accepted: false, reason: body.name ?? `http ${response.status}` }
  }
  return { accepted: true, id: body.id }
}
