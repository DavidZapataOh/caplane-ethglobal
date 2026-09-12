'use client'

import { useEffect, useState } from 'react'
import { Icon } from '../../../components/icon'

type Served = {
  domain: Record<string, unknown>
  types: Record<string, ReadonlyArray<{ name: string; type: string }>>
  primaryType: string
  message: Record<string, string>
  /** The fields to put on screen, named by the service. */
  shown: string[]
}

type Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

const base = process.env.NEXT_PUBLIC_API_URL ?? ''

/**
 * The figures are rendered by walking `shown`, never by naming fields here. Naming them is how a
 * screen and a signed structure drift apart — and showing someone one amount while the structure
 * carries another is the exact failure this signature format exists to prevent.
 */
export function Sign() {
  const [served, setServed] = useState<Served | undefined>()
  const [state, setState] = useState<'loading' | 'ready' | 'signed' | 'error'>('loading')
  const [detail, setDetail] = useState('')

  useEffect(() => {
    // Every branch goes through the same async path on purpose: a setState called straight from an
    // effect body is a render-phase update, and the lint rule that forbids it is right.
    const read = async () => {
      const token = new URLSearchParams(window.location.search).get('t')
      if (token === null) throw new Error('This link is incomplete. Open the one in the message.')
      const response = await fetch(`${base}/confirmations/${token}`)
      if (!response.ok) throw new Error('This link is not valid or has expired.')
      return (await response.json()) as Served
    }
    read()
      .then((answer) => {
        setServed(answer)
        setState('ready')
      })
      .catch((error: Error) => {
        setState('error')
        setDetail(error.message)
      })
  }, [])

  const sign = async () => {
    const token = new URLSearchParams(window.location.search).get('t')
    const injected = (window as unknown as { ethereum?: Provider }).ethereum
    if (injected === undefined || served === undefined || token === null) {
      setState('error')
      setDetail('No wallet is available in this browser to sign with.')
      return
    }
    try {
      const [debtor] = (await injected.request({ method: 'eth_requestAccounts' })) as string[]
      if (debtor === undefined) throw new Error('No account was shared.')
      const signature = (await injected.request({
        method: 'eth_signTypedData_v4',
        params: [
          debtor,
          JSON.stringify({
            domain: served.domain,
            types: {
              EIP712Domain: [
                { name: 'name', type: 'string' },
                { name: 'version', type: 'string' },
                { name: 'chainId', type: 'uint256' },
                { name: 'verifyingContract', type: 'address' },
              ],
              ...served.types,
            },
            primaryType: served.primaryType,
            message: { ...served.message, debtor },
          }),
        ],
      })) as string
      const posted = await fetch(`${base}/confirmations/${token}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ debtor, signature }),
      })
      if (!posted.ok) throw new Error(((await posted.json()) as { error: string }).error)
      setState('signed')
    } catch (error) {
      setState('error')
      setDetail((error as Error).message)
    }
  }

  if (state === 'loading') {
    return (
      <p className="mt-6 flex items-center gap-2">
        <Icon name="loading" /> Reading the terms.
      </p>
    )
  }
  if (state === 'error') {
    // `alert`, never `rejected`: that icon is bound to the registry status and the discipline of
    // not reusing it is what keeps the set meaningful.
    return (
      <p className="mt-6 flex items-center gap-2 text-seal-text">
        <Icon name="alert" /> {detail}
      </p>
    )
  }
  if (state === 'signed') {
    return (
      <p className="mt-6 flex items-center gap-2 text-verified-text">
        <Icon name="verified" /> Confirmed. You can close this page.
      </p>
    )
  }

  return (
    <div className="mt-6 border border-border">
      <dl className="divide-y divide-border">
        {served?.shown.map((field) => (
          <div key={field} className="flex gap-6 p-3">
            <dt className="w-48 text-text-3">{field}</dt>
            <dd className="text-text">{served.message[field]}</dd>
          </div>
        ))}
      </dl>
      <button
        type="button"
        onClick={sign}
        className="w-full border-t border-border bg-surface-2 p-3 text-text hover:bg-surface"
      >
        Sign these terms
      </button>
    </div>
  )
}
