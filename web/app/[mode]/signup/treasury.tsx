'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useState } from 'react'
import { Alert } from '../../../components/alert'
import { Button } from '../../../components/button'
import { Field } from '../../../components/field'
import { Icon } from '../../../components/icon'
import { outcomeOf, weiOf } from './treasury-support.ts'

/**
 * The treasury operation the policy can refuse. A transfer under the threshold is signed; one at
 * or above it is refused by Privy before anything is signed, and the refusal is shown here — which
 * is the point of the whole flow, and the reason the amount field starts empty rather than
 * pre-filled with a number that would prove nothing either way.
 */
export function Treasury({ binding, from }: { binding: string; from: string }) {
  const { getAccessToken } = usePrivy()
  const [to, setTo] = useState('0x000000000000000000000000000000000000dEaD')
  const [amount, setAmount] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'blocked' | 'error'>('idle')
  const [detail, setDetail] = useState('')

  const send = async () => {
    setState('sending')
    try {
      const response = await fetch('/api/organizations/transfer', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${await getAccessToken()}`,
        },
        body: JSON.stringify({ binding, from, to, valueWei: weiOf(amount).toString() }),
      })
      const outcome = outcomeOf(await response.json())
      setDetail(outcome.detail)
      setState(outcome.kind)
    } catch (error) {
      setDetail((error as Error).message)
      setState('error')
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      <h2 className="font-display text-text text-xl">Treasury</h2>
      <Field label="Recipient" value={to} onChange={(event) => setTo(event.target.value)} />
      <Field
        label="Amount"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        placeholder="0.001"
        hint="Transfers at or above 0.01 need an approval this policy does not grant."
      />
      <div>
        <Button variant="primary" onClick={() => void send()} disabled={state === 'sending'}>
          <Icon name={state === 'sending' ? 'loading' : 'disbursement'} />
          {state === 'sending' ? 'Sending' : 'Send'}
        </Button>
      </div>
      {state === 'sent' && (
        <p className="flex items-center gap-2 text-verified-text">
          <Icon name="verified" />
          <a
            href={`https://testnet.arcscan.app/tx/${detail}`}
            target="_blank"
            rel="noreferrer"
            className="underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
          >
            Sent — {detail}
          </a>
        </p>
      )}
      {state === 'blocked' && <Alert variant="blocked">{detail}</Alert>}
      {state === 'error' && <Alert variant="error">{detail}</Alert>}
    </div>
  )
}
