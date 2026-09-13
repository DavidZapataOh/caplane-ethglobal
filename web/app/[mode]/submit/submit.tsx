'use client'

import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useState } from 'react'
import { type Hex, encodeFunctionData } from 'viem'
import { Alert } from '../../../components/alert'
import { Button } from '../../../components/button'
import { DataRow } from '../../../components/data-row'
import { Field } from '../../../components/field'
import { Icon } from '../../../components/icon'
import { FindDebtor } from './find-debtor'
import { buildEnvelope } from './seal'
import { ARC, API, INBOX, inboxAbi, submissionIdOf } from './inbox'
import { ClaimType } from '../../../../claim/abi/frozen'
import { claimIdOf } from '../../../../claim/commit'
import { toComponents } from '../../../../claim/index'

type Stage = 'idle' | 'sealing' | 'sending' | 'sent' | 'error'

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
  const [envelopeBytes, setEnvelopeBytes] = useState(0)
  const [expiresAtBlock, setExpiresAtBlock] = useState('')

  // The identity the debtor signs over: derived from the claim's own fields, without a pepper,
  // so the debtor and anyone else can recompute it. The peppered one lives only in the enclave.
  const claimId =
    invoiceNumber === '' || amountMinor === '' || dueDate === ''
      ? ''
      : claimIdOf(
          ClaimType.Invoice,
          toComponents(ClaimType.Invoice, {
            debtorTaxId: 'unknown',
            invoiceNumber,
            amountMinor,
            currency,
            dueDate,
            issuerTaxId: 'unknown',
            country: 'AU',
          }),
        )

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
      setDetail(hash)
      setStage('sent')
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
    return (
      <div className="mt-6">
        <Button variant="primary" onClick={login}>
          <Icon name="wallet" /> Sign in to submit
        </Button>
      </div>
    )
  }

  return (
    <div className="mt-6 flex max-w-xl flex-col gap-4">
      <FindDebtor
        claimId={claimId}
        creditor={wallet?.address ?? ''}
        invoiceNumber={invoiceNumber}
        currency={currency}
        amountMinor={amountMinor}
        dueDate={dueDate}
        expiresAtBlock={expiresAtBlock}
        onReceipt={setReceipt}
      />
      <Field
        label="Confirmation receipt"
        value={receipt}
        onChange={(event) => setReceipt(event.target.value)}
        hint="Filled in when the debtor is asked; paste one to resume a claim from another session."
      />
      <Field
        label="Invoice number"
        value={invoiceNumber}
        onChange={(event) => setInvoiceNumber(event.target.value)}
        placeholder="ORC1043"
      />
      <Field
        label="Amount, in minor units"
        value={amountMinor}
        onChange={(event) => setAmountMinor(event.target.value)}
        placeholder="27500000"
      />
      <Field label="Currency" value={currency} onChange={(event) => setCurrency(event.target.value)} />
      <Field
        label="Due date"
        value={dueDate}
        onChange={(event) => setDueDate(event.target.value)}
        placeholder="2027-01-30"
      />
      <Field
        label="Confirmation expires at block"
        value={expiresAtBlock}
        onChange={(event) => setExpiresAtBlock(event.target.value)}
        placeholder="70000000"
      />
      <div>
        <Button variant="primary" onClick={() => void submit()} disabled={stage === 'sealing' || stage === 'sending'}>
          <Icon name={stage === 'idle' || stage === 'error' ? 'encrypted' : 'loading'} />
          {stage === 'sealing' ? 'Sealing' : stage === 'sending' ? 'Submitting' : 'Seal and submit'}
        </Button>
      </div>

      {envelopeBytes > 0 && (
        <dl className="border border-border">
          <DataRow label="envelope" value={`${envelopeBytes} bytes, ciphertext only`} />
          <DataRow label="signed by" value={wallet?.address ?? '—'} />
        </dl>
      )}

      {stage === 'sent' && (
        <p className="flex items-center gap-2 text-verified-text">
          <Icon name="verified" />
          <a
            href={`https://testnet.arcscan.app/tx/${detail}`}
            target="_blank"
            rel="noreferrer"
            className="underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
          >
            Submitted — {detail}
          </a>
        </p>
      )}
      {stage === 'error' && <Alert variant="error">{detail}</Alert>}
    </div>
  )
}
