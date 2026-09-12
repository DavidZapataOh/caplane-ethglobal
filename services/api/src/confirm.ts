import type { IncomingMessage, ServerResponse } from 'node:http'
import { keccak256, toHex, verifyTypedData } from 'viem'
import book from '../abi/deployments.arc-testnet.json' with { type: 'json' }
import { CONFIRMATION_TYPES, SHOWN, confirmationDomain } from './confirmation.js'
import { contactEmailOf } from './ledger.js'
import { type LinkPayload, markUsed, mint, open, receiptOf } from './link.js'
import { type SendOutcome, idempotencyKeyFor, send } from './notify.js'

const ZERO = '0x0000000000000000000000000000000000000000' as const

/** Anything that looks like the caller telling us where to write. Refused, not ignored. */
const OFFERED_ADDRESS = ['email', 'to', 'address', 'emailAddress', 'recipient']

export type ConfirmDeps = {
  sendMail?: (message: { to: string; subject: string; text: string; idempotencyKey: string }) => Promise<SendOutcome>
  resolveEmail?: (contactId: string) => Promise<string | undefined>
  linkBase?: string
}

type Signed = { confirmation: Record<string, string>; signature: string }
const signed = new Map<string, Signed>()

const messageOf = (payload: LinkPayload, debtor: `0x${string}`) => ({
  creditor: payload.creditor,
  debtor,
  claimId: payload.claimId,
  invoiceNumber: payload.invoiceNumber,
  currency: payload.currency,
  amountMinor: payload.amountMinor,
  dueDate: payload.dueDate,
  // The ledger's own key for the counterparty, hashed. The caller names the contact; the address it
  // resolves to is never theirs to choose.
  debtorRef: keccak256(toHex(payload.contactId)),
  expiresAtBlock: payload.expiresAtBlock,
})

const body = async (request: IncomingMessage): Promise<Record<string, unknown>> => {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>
  } catch {
    return {}
  }
}

const reply = (response: ServerResponse, status: number, value: unknown, cors: Record<string, string>) => {
  response.writeHead(status, { 'content-type': 'application/json', ...cors })
  response.end(JSON.stringify(value))
}

/**
 * The confirmation channel.
 *
 * The one property everything else rests on: the address is resolved from the accounting ledger
 * inside this request and is never taken from the caller. The enclave cannot establish that the key
 * which signed belongs to the debtor — the ledger holds no chain address — so the link arriving at
 * an address only the ledger knows is the entire anchor. A service that wrote to an address it was
 * handed would leave that anchor holding nothing.
 *
 * The token is never returned to the caller either. Handing it back would let whoever asked open
 * the link without receiving the mail, which is the same anchor by another route.
 */
export const routeConfirm = async (
  request: IncomingMessage,
  response: ServerResponse,
  cors: Record<string, string>,
  deps: ConfirmDeps = {},
): Promise<boolean> => {
  const url = request.url ?? ''
  const sendMail = deps.sendMail ?? send
  const resolveEmail = deps.resolveEmail ?? contactEmailOf
  const linkBase = deps.linkBase ?? process.env.CONFIRM_LINK_BASE ?? 'https://app.caplane.xyz/confirm'

  if (url === '/confirmations' && request.method === 'POST') {
    const given = await body(request)
    const offered = OFFERED_ADDRESS.find((field) => given[field] !== undefined)
    if (offered !== undefined) {
      reply(response, 400, { error: `the address comes from the ledger, not from ${offered}` }, cors)
      return true
    }
    const contactId = String(given.contactId ?? '')
    if (contactId === '') {
      reply(response, 400, { error: 'contactId is required' }, cors)
      return true
    }
    let email: string | undefined
    try {
      email = await resolveEmail(contactId)
    } catch (error) {
      reply(response, 502, { error: `the ledger did not answer: ${String(error)}` }, cors)
      return true
    }
    if (email === undefined) {
      reply(response, 422, { error: 'the ledger holds no address for that contact' }, cors)
      return true
    }
    const payload = {
      claimId: String(given.claimId ?? ''),
      creditor: String(given.creditor ?? ''),
      contactId,
      invoiceNumber: String(given.invoiceNumber ?? ''),
      currency: String(given.currency ?? ''),
      amountMinor: String(given.amountMinor ?? ''),
      dueDate: String(given.dueDate ?? ''),
      expiresAtBlock: String(given.expiresAtBlock ?? ''),
      issuedAt: Math.floor(Date.now() / 1000),
    } as LinkPayload
    const token = mint(payload)
    const outcome = await sendMail({
      to: email,
      subject: 'Confirm a receivable pledged against you',
      text: `A lender has been named as creditor on ${payload.invoiceNumber}. Review the exact amounts and confirm, or ignore this message: ${linkBase}?t=${token}`,
      // Derived from the token, not from the message: measured, the same key with a changed body
      // answers 409, and the message carries a fresh link every time it is built.
      idempotencyKey: idempotencyKeyFor(token),
    })
    // `accepted` and never `delivered`: the credential is send-only and cannot read a mail history.
    reply(response, outcome.accepted ? 200 : 502, { receipt: receiptOf(token), accepted: outcome.accepted }, cors)
    return true
  }

  const confirmation = /^\/confirmations\/([A-Za-z0-9_=-]+\.[A-Za-z0-9_=-]+)$/.exec(url)
  if (confirmation !== null) {
    const token = confirmation[1] as string
    const payload = open(token)
    if (payload === undefined) {
      reply(response, 404, { error: 'that link is not valid or has expired' }, cors)
      return true
    }
    if (request.method === 'GET') {
      reply(
        response,
        200,
        {
          domain: confirmationDomain(book.registry as `0x${string}`),
          types: CONFIRMATION_TYPES,
          primaryType: 'DebtorConfirmation',
          message: messageOf(payload, ZERO),
          shown: SHOWN,
        },
        cors,
      )
      return true
    }
    if (request.method === 'POST') {
      const given = await body(request)
      const debtor = String(given.debtor ?? '')
      const signature = String(given.signature ?? '')
      if (!/^0x[0-9a-fA-F]{40}$/.test(debtor) || !/^0x[0-9a-fA-F]{130}$/.test(signature)) {
        reply(response, 400, { error: 'debtor and signature are required' }, cors)
        return true
      }
      const message = messageOf(payload, debtor as `0x${string}`)
      const valid = await verifyTypedData({
        address: debtor as `0x${string}`,
        signature: signature as `0x${string}`,
        domain: confirmationDomain(book.registry as `0x${string}`),
        types: CONFIRMATION_TYPES,
        primaryType: 'DebtorConfirmation',
        message: {
          ...message,
          amountMinor: BigInt(payload.amountMinor),
          expiresAtBlock: BigInt(payload.expiresAtBlock),
        },
      }).catch(() => false)
      if (!valid) {
        reply(response, 400, { error: 'that signature was not made by the address it names' }, cors)
        return true
      }
      // Verified first, then spent: a bad signature must not burn a link the debtor can still use.
      if (!markUsed(token)) {
        reply(response, 409, { error: 'that link has already been used' }, cors)
        return true
      }
      signed.set(receiptOf(token), { confirmation: message, signature })
      reply(response, 200, { accepted: true }, cors)
      return true
    }
    reply(response, 405, { error: 'method not allowed' }, cors)
    return true
  }

  const receipt = /^\/receipts\/([A-Za-z0-9_=-]{32})$/.exec(url)
  if (receipt !== null && request.method === 'GET') {
    const found = signed.get(receipt[1] as string)
    if (found === undefined) {
      reply(response, 404, { error: 'no confirmation against that receipt yet' }, cors)
      return true
    }
    reply(response, 200, found, cors)
    return true
  }

  return false
}
