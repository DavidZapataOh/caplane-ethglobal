'use client'

import { useState } from 'react'
import { Alert } from '../../../components/alert'
import { Button } from '../../../components/button'
import { Field } from '../../../components/field'
import { Icon } from '../../../components/icon'
import { type LedgerIdentity, confirmationClaimId } from './claim-id'
import { API } from './inbox'

type Contact = { id: string; name: string }

/**
 * Finds the debtor in the ledger and asks them to confirm.
 *
 * The business knows who owes them; it does not know the identifier the accounting system files
 * that counterparty under, and the confirmation channel requires exactly that. Nothing here names
 * an address: the service resolves it from the ledger, which is the anchor the whole channel rests
 * on, and refuses the request outright if the caller offers one.
 */
export function FindDebtor({
  creditor,
  invoiceNumber,
  currency,
  amountMinor,
  dueDate,
  expiresAtBlock,
  onReceipt,
  ready,
}: {
  creditor: string
  invoiceNumber: string
  currency: string
  amountMinor: string
  dueDate: string
  expiresAtBlock: string
  onReceipt: (receipt: string) => void
  /** False until the claim's own fields are filled — see below. */
  ready: boolean
}) {
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<Contact[]>([])
  const [ledger, setLedger] = useState<LedgerIdentity | undefined>()
  const [state, setState] = useState<'idle' | 'searching' | 'asking' | 'asked' | 'error'>('idle')
  const [detail, setDetail] = useState('')

  const search = async () => {
    setState('searching')
    try {
      const response = await fetch(`${API}/contacts?q=${encodeURIComponent(query)}`)
      const body = (await response.json()) as {
        contacts?: Contact[]
        ledger?: LedgerIdentity
        error?: string
      }
      if (!response.ok) throw new Error(body.error ?? 'The ledger did not answer.')
      setFound(body.contacts ?? [])
      setLedger(body.ledger)
      setState('idle')
    } catch (error) {
      setDetail((error as Error).message)
      setState('error')
    }
  }

  const ask = async (contact: Contact) => {
    if (ledger === undefined) {
      setDetail('The ledger did not say which organisation it answered for.')
      setState('error')
      return
    }
    setState('asking')
    try {
      const response = await fetch(`${API}/confirmations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contactId: contact.id,
          // Built here, not in the form: the enclave replaces the debtor and the issuer with the
          // ledger's own values before it recomputes this, so an identity derived from anything
          // else is one it can never reach — and the claim is refused as unconfirmed.
          claimId: confirmationClaimId(
            { invoiceNumber, currency, amountMinor, dueDate },
            contact.name,
            ledger,
          ),
          creditor,
          invoiceNumber,
          currency,
          amountMinor,
          dueDate,
          expiresAtBlock,
        }),
      })
      const body = (await response.json()) as { receipt?: string; error?: string }
      if (!response.ok || body.receipt === undefined) {
        throw new Error(body.error ?? 'The confirmation could not be sent.')
      }
      onReceipt(body.receipt)
      setState('asked')
    } catch (error) {
      setDetail((error as Error).message)
      setState('error')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Field
        label="Debtor"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void search()
        }}
        placeholder="Their name in your ledger"
        hint="At least three characters."
      />
      <div>
        <Button onClick={() => void search()} disabled={state === 'searching'}>
          <Icon name={state === 'searching' ? 'loading' : 'lookup'} /> Search the ledger
        </Button>
      </div>

      {found.length > 0 && (
        <dl className="divide-y divide-border border border-border">
          {found.map((contact) => (
            <div key={contact.id} className="flex items-center gap-4 p-3">
              <dt className="flex-1 text-text">{contact.name}</dt>
              <dd>
                {/* The confirmation the debtor signs carries the claim's identity, derived from
                    the invoice fields below. Asking before they are filled would have them sign
                    over an empty one, and the seal would not match what they agreed to — a
                    failure that only surfaces at the end, with no way back. */}
                <Button
                  onClick={() => void ask(contact)}
                  disabled={state === 'asking' || !ready}
                >
                  <Icon name="debtor" /> Ask them to confirm
                </Button>
              </dd>
            </div>
          ))}
        </dl>
      )}

      {!ready && found.length > 0 && (
        <p className="font-prose text-text-3">
          Fill in the invoice below first — what the debtor signs is derived from it.
        </p>
      )}

      {state === 'asked' && (
        <p className="flex items-center gap-2 text-verified-text">
          <Icon name="verified" /> Sent. The claim can be sealed once they sign.
        </p>
      )}
      {state === 'error' && <Alert variant="error">{detail}</Alert>}
    </div>
  )
}
