'use client'

import { usePrivy, useWallets } from '@privy-io/react-auth'
import { type ReactNode, useState } from 'react'
import { type Hex, encodeFunctionData } from 'viem'
import { Alert } from '../../../components/alert'
import { Badge } from '../../../components/badge'
import { Button } from '../../../components/button'
import { DataRow } from '../../../components/data-row'
import { Field } from '../../../components/field'
import { Icon } from '../../../components/icon'
import { FindDebtor } from './find-debtor'
import { buildEnvelope } from '../../../../claim/seal'
import { watchVerdict } from './verdict'
import { ARC, API, INBOX, inboxAbi, submissionIdOf } from './inbox'

type Stage = 'idle' | 'sealing' | 'sending' | 'watching' | 'recorded' | 'rejected' | 'pending' | 'error'

/**
 * One step of the three, with the only three states it can be in: waiting for you, done, or not
 * your turn yet. A blocked step says why in its own body rather than leaving a disabled control to
 * explain itself.
 */
const Step = ({
  n,
  title,
  children,
  done = false,
  blocked = false,
}: {
  n: number
  title: string
  children: ReactNode
  done?: boolean
  blocked?: boolean
}) => (
  <div className="flex gap-4">
    <span
      className={`mt-0.5 flex size-6 shrink-0 items-center justify-center border font-display text-sm ${
        done
          ? 'border-verified text-verified-text'
          : blocked
            ? 'border-border text-text-3'
            : 'border-border-strong text-text'
      }`}
    >
      {done ? <Icon name="verified" className="size-3.5" /> : n}
    </span>
    <div className="flex flex-col gap-1.5">
      <h2 className={`font-display text-base font-medium ${blocked ? 'text-text-3' : 'text-text'}`}>
        {title}
      </h2>
      <p className="max-w-prose font-prose text-sm leading-[1.6] text-text-2">{children}</p>
    </div>
  </div>
)

/**
 * Seals in the browser, signs with the visitor's Privy wallet, and broadcasts the signed
 * transaction itself over Arc's public RPC.
 *
 * The order is not arrangeable: the address that will call `submit` travels inside the sealed
 * plaintext, so the wallet has to be known before anything is sealed. Sealing first would mean
 * re-sealing whenever the visitor switched accounts.
 */
export function Submit() {
  const { ready, authenticated, login } = usePrivy()
  const { wallets } = useWallets()
  const [receipt, setReceipt] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [amountMinor, setAmountMinor] = useState('')
  const [currency, setCurrency] = useState('AUD')
  const [dueDate, setDueDate] = useState('')
  const [stage, setStage] = useState<Stage>('idle')
  const [detail, setDetail] = useState('')
  const [transaction, setTransaction] = useState('')
  const [envelopeBytes, setEnvelopeBytes] = useState(0)
  // A block far enough ahead that nobody has to reason about it. It bounds how long the customer's
  // signature stays usable, and asking a person to name a block height is asking them to guess.
  const [expiresAtBlock, setExpiresAtBlock] = useState('99000000')
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Whether the claim carries enough to derive an identity at all. The identity itself is built
  // where the debtor is chosen: two of its components are the ledger's, not this form's.
  const complete = invoiceNumber !== '' && amountMinor !== '' && dueDate !== ''
  const confirmed = receipt !== ''

  /**
   * What the minor units mean, echoed back. The field asks for 27500000 and a person is holding an
   * invoice that says 275,000.00 — measured on a real person, that is where they stop and ask.
   */
  const amountShown = (() => {
    if (!/^\d+$/.test(amountMinor)) return undefined
    const digits = currency.toUpperCase() === 'JPY' ? 0 : 2
    const padded = amountMinor.padStart(digits + 1, '0')
    const whole = padded.slice(0, padded.length - digits) || '0'
    const fraction = digits === 0 ? '' : `.${padded.slice(padded.length - digits)}`
    return `${Number(whole).toLocaleString('en-US')}${fraction} ${currency.toUpperCase()}`
  })()

  const wallet = wallets[0]

  const submit = async () => {
    if (wallet === undefined) {
      setStage('error')
      setDetail('No wallet is connected to sign with.')
      return
    }
    setStage('sealing')
    try {
      // The signature the debtor left, fetched by its receipt. The confirmation service holds
      // that and nothing else — the claim's own fields are the business's, and stay in this
      // browser until they are sealed.
      const response = await fetch(`${API}/receipts/${receipt}`)
      if (!response.ok) {
        throw new Error('That receipt has no signed confirmation yet.')
      }
      const served = (await response.json()) as {
        confirmation: Record<string, string>
        signature: Hex
      }
      const confirmation = {
        ...served.confirmation,
        amountMinor: BigInt(served.confirmation.amountMinor ?? '0'),
        expiresAtBlock: BigInt(served.confirmation.expiresAtBlock ?? '0'),
      } as Parameters<typeof buildEnvelope>[1]
      const claim = {
        debtorTaxId: served.confirmation.debtor ?? '',
        invoiceNumber,
        amountMinor,
        currency,
        dueDate,
        issuerTaxId: wallet.address,
        country: 'AU',
      }
      const signature = served.signature

      const envelope = buildEnvelope(
        claim,
        confirmation,
        signature,
        wallet.address as Hex,
        ARC.enclavePublicKey,
      )
      setEnvelopeBytes(envelope.length)

      const ciphertext = `0x${Buffer.from(envelope).toString('hex')}` as Hex
      const data = encodeFunctionData({
        abi: inboxAbi,
        functionName: 'submit',
        args: [submissionIdOf(wallet.address as Hex, ciphertext), ciphertext],
      })

      setStage('sending')
      const provider = await wallet.getEthereumProvider()
      const hash = (await provider.request({
        method: 'eth_sendTransaction',
        params: [{ from: wallet.address, to: INBOX, data, chainId: ARC.chainIdHex }],
      })) as string
      setTransaction(hash)

      // The transaction landing is not the answer. The enclave decides afterwards, and the two
      // outcomes it can reach are different things to tell a business — so the page waits for one
      // of them and says `pending` if neither arrives, rather than calling a receipt a lien.
      setStage('watching')
      const verdict = await watchVerdict(
        submissionIdOf(wallet.address as Hex, ciphertext),
        wallet.address as Hex,
      )
      if (verdict.kind === 'rejected') {
        setDetail(verdict.reason)
        setStage('rejected')
      } else if (verdict.kind === 'recorded') {
        setDetail(verdict.lienId)
        setStage('recorded')
      } else {
        setStage('pending')
      }
    } catch (error) {
      setDetail((error as Error).message)
      setStage('error')
    }
  }

  if (!ready) {
    return (
      <p className="mt-6 flex items-center gap-2">
        <Icon name="loading" /> Starting up.
      </p>
    )
  }

  if (!authenticated) {
    // Signed out, the page used to be one button and nothing else — no way to know what you were
    // agreeing to start, or what you would need to hand over, before committing to a wallet.
    return (
      <div className="mt-10 flex max-w-2xl flex-col gap-8">
        <div className="flex flex-col gap-5 border border-border p-6">
          <h2 className="font-display text-base font-medium text-text">What you will need</h2>
          <ul className="flex flex-col gap-3 font-prose text-sm leading-[1.6] text-text-2">
            <li className="flex gap-3">
              <Icon name="contract" className="mt-0.5 size-4 shrink-0 text-text-3" />
              The invoice, as it appears in your accounting system: its number, amount, currency and
              due date.
            </li>
            <li className="flex gap-3">
              <Icon name="debtor" className="mt-0.5 size-4 shrink-0 text-text-3" />
              Your customer, reachable at the email your ledger holds for them. They confirm the
              figures; you cannot pledge on their behalf.
            </li>
            <li className="flex gap-3">
              <Icon name="wallet" className="mt-0.5 size-4 shrink-0 text-text-3" />
              A wallet, to sign the one transaction that carries it.
            </li>
          </ul>
          <p className="font-prose text-xs leading-[1.6] text-text-3">
            You can fill in the invoice and come back — nothing is sent until your customer signs.
          </p>
        </div>
        <div>
          <Button variant="primary" onClick={login}>
            <Icon name="wallet" /> Sign in to start
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-8 flex max-w-2xl flex-col gap-10">
      {/* The order is the order the work happens in. It used to open with the debtor search, which
          cannot be used until the invoice below is filled — so the first thing the page did was
          offer a control and then refuse it. */}
      <section className="flex flex-col gap-4">
        <Step n={1} title="The invoice you want to finance" done={complete}>
          Copy it from your accounting system. These four fields are what your customer will be
          asked to confirm, so they have to match the invoice exactly.
        </Step>
        <Field
          label="Invoice number"
          value={invoiceNumber}
          onChange={(event) => setInvoiceNumber(event.target.value)}
          placeholder="ORC1043"
          hint="Exactly as it appears in your ledger."
        />
        <Field
          label="Amount"
          value={amountMinor}
          onChange={(event) => setAmountMinor(event.target.value)}
          placeholder="27500000"
          hint={
            amountShown === undefined
              ? 'In minor units — cents, not dollars. 275,000.00 is written 27500000.'
              : `That is ${amountShown}.`
          }
        />
        <Field
          label="Currency"
          value={currency}
          onChange={(event) => setCurrency(event.target.value)}
          hint="Three letters, as the invoice states it."
        />
        <Field
          label="Due date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          placeholder="2026-12-31"
          hint="Year first."
        />
      </section>

      <section className="flex flex-col gap-4">
        <Step n={2} title="Ask your customer to confirm" done={confirmed} blocked={!complete}>
          {complete
            ? 'Search your ledger for them. We email the address your ledger holds — never one typed here — and they sign the figures above. Nothing is sent until they do.'
            : 'Fill in the invoice first. What your customer signs is derived from it, so asking now would have them agree to a blank claim.'}
        </Step>
        <FindDebtor
          creditor={wallet?.address ?? ''}
          invoiceNumber={invoiceNumber}
          currency={currency}
          amountMinor={amountMinor}
          dueDate={dueDate}
          expiresAtBlock={expiresAtBlock}
          onReceipt={setReceipt}
          ready={complete}
        />
        {confirmed && (
          <dl className="border border-border">
            <DataRow label="confirmation" value={receipt} />
          </dl>
        )}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="font-prose text-sm text-text-3 underline underline-offset-4 hover:text-text-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
          >
            {showAdvanced ? 'Hide' : 'Resuming from another session, or changing the expiry?'}
          </button>
        </div>
        {showAdvanced && (
          <div className="flex flex-col gap-4 border-l border-border pl-4">
            <Field
              label="Confirmation receipt"
              value={receipt}
              onChange={(event) => setReceipt(event.target.value)}
              hint="Filled in for you when your customer is asked. Paste one to pick up where you left off."
            />
            <Field
              label="Confirmation expires at block"
              value={expiresAtBlock}
              onChange={(event) => setExpiresAtBlock(event.target.value)}
              hint="How long your customer's signature stays usable. The default is far enough ahead that it will not expire on you."
            />
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <Step n={3} title="Seal it and send it" blocked={!complete || !confirmed}>
          {!complete
            ? 'The invoice is not filled in yet.'
            : !confirmed
              ? 'Waiting on your customer. This turns on the moment they sign.'
              : 'Your browser encrypts the invoice so only the enclave can read it, then sends one transaction. You will see the verdict here in about fifteen seconds.'}
        </Step>
        <div>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={
              !complete ||
              !confirmed ||
              stage === 'sealing' ||
              stage === 'sending' ||
              stage === 'watching'
            }
          >
            <Icon name={stage === 'idle' || stage === 'error' ? 'encrypted' : 'loading'} />
            {stage === 'sealing'
              ? 'Encrypting'
              : stage === 'sending'
                ? 'Sending'
                : stage === 'watching'
                  ? 'Waiting for the enclave'
                  : 'Seal and submit'}
          </Button>
        </div>
      </section>

      {envelopeBytes > 0 && (
        <dl className="border border-border">
          <DataRow label="envelope" value={`${envelopeBytes} bytes, ciphertext only`} />
          <DataRow label="signed by" value={wallet?.address ?? '—'} />
        </dl>
      )}

      {transaction !== '' && (
        <p className="flex items-center gap-2 text-text-3">
          <a
            href={`https://testnet.arcscan.app/tx/${transaction}`}
            target="_blank"
            rel="noreferrer"
            className="underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
          >
            Submitted — {transaction}
          </a>
        </p>
      )}

      {stage === 'recorded' && (
        <div className="flex flex-col gap-2">
          <Badge variant="encumbered">Recorded</Badge>
          <dl className="border border-border">
            <DataRow label="lien" value={detail} />
          </dl>
        </div>
      )}
      {/* A refusal by the enclave is a risk verdict, not a policy block — `blocked` means one
          specific thing in this system and this is not it. */}
      {stage === 'rejected' && <Alert variant="error">Rejected — {detail}</Alert>}
      {stage === 'pending' && (
        <Alert variant="error">
          The transaction landed and the enclave has not answered yet. Nothing is recorded until it
          does.
        </Alert>
      )}
      {stage === 'error' && <Alert variant="error">{detail}</Alert>}
    </div>
  )
}
