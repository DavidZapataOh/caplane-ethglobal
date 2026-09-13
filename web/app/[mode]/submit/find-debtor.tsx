'use client'

import { useState } from 'react'
import { Alert } from '../../../components/alert'
import { Button } from '../../../components/button'
import { Field } from '../../../components/field'
import { Icon } from '../../../components/icon'
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
  claimId,
  creditor,
  invoiceNumber,
  currency,
  amountMinor,
  dueDate,
  expiresAtBlock,
  onReceipt,
}: {
  claimId: string
  creditor: string
  invoiceNumber: string
  currency: string
  amountMinor: string
  dueDate: string
  expiresAtBlock: string
  onReceipt: (receipt: string) => void
}) {
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<Contact[]>([])
  const [state, setState] = useState<'idle' | 'searching' | 'asking' | 'asked' | 'error'>('idle')
  const [detail, setDetail] = useState('')

  const search = async () => {
    setState('searching')
    try {
      const response = await fetch(`${API}/contacts?q=${encodeURIComponent(query)}`)
      const body = (await response.json()) as { contacts?: Contact[]; error?: string }
      if (!response.ok) throw new Error(body.error ?? 'The ledger did not answer.')
      setFound(body.contacts ?? [])
      setState('idle')
    } catch (error) {
      setDetail((error as Error).message)
      setState('error')
    }
  }

  const ask = async (contact: Contact) => {
    setState('asking')
    try {
      const response = await fetch(`${API}/confirmations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contactId: contact.id,
          claimId,
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
                <Button onClick={() => void ask(contact)} disabled={state === 'asking'}>
                  <Icon name="debtor" /> Ask them to confirm
                </Button>
              </dd>
            </div>
          ))}
        </dl>
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
