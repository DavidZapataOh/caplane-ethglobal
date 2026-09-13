'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useState } from 'react'
import { Alert } from '../../../components/alert'
import { Button } from '../../../components/button'
import { DataRow } from '../../../components/data-row'
import { Field } from '../../../components/field'
import { Icon } from '../../../components/icon'
import { Treasury } from './treasury'
import { validOrgName } from './treasury-support.ts'

type Organization = { id: string; walletId: string; walletAddress: string }

/**
 * Signing up a business. The person authenticates with Privy; the organization, its wallet and its
 * treasury policy are created on the server, which is the only side holding the app secret.
 */
export function Signup() {
  const { ready, authenticated, login, user, getAccessToken } = usePrivy()
  const [name, setName] = useState('')
  const [state, setState] = useState<'idle' | 'creating' | 'done' | 'error'>('idle')
  const [detail, setDetail] = useState('')
  const [organization, setOrganization] = useState<Organization | undefined>()

  const create = async () => {
    if (!validOrgName(name)) {
      setState('error')
      setDetail('An organization name is required.')
      return
    }
    setState('creating')
    try {
      const response = await fetch('/api/organizations', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${await getAccessToken()}`,
        },
        body: JSON.stringify({ name }),
      })
      if (!response.ok) throw new Error((await response.json()).error ?? 'Sign-up failed.')
      setOrganization((await response.json()) as Organization)
      setState('done')
    } catch (error) {
      setState('error')
      setDetail((error as Error).message)
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
      <div className="mt-6 max-w-xl">
        <p className="max-w-prose font-prose text-text-2">
          Sign in to create an organization. The wallet it receives is controlled by a treasury
          policy from the moment it exists — not by a rule anyone has to remember to apply.
        </p>
        <div className="mt-4">
          <Button variant="primary" onClick={login}>
            <Icon name="organization" /> Sign in
          </Button>
        </div>
      </div>
    )
  }

  if (state === 'done' && organization !== undefined) {
    return (
      <div className="mt-6 max-w-3xl">
        <div className="border border-border">
          <p className="border-b border-border bg-surface-2 p-3 text-text">
            {name} has an organization wallet on Arc.
          </p>
          <dl className="divide-y divide-border">
            <DataRow label="organization" value={organization.id} />
            <DataRow label="wallet" value={organization.walletAddress} />
          </dl>
        </div>
        <Treasury walletId={organization.walletId} from={organization.walletAddress} />
      </div>
    )
  }

  return (
    <div className="mt-6 flex max-w-xl flex-col gap-4">
      <p className="font-prose text-text-3">Signed in as {user?.id}</p>
      <Field
        label="Organization name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Acme Receivables Ltd"
        hint="This names the organization, its key quorum and its treasury policy in Privy."
      />
      <div>
        <Button variant="primary" onClick={() => void create()} disabled={state === 'creating'}>
          {state === 'creating' ? <Icon name="loading" /> : <Icon name="wallet" />}
          {state === 'creating' ? 'Creating' : 'Create the organization'}
        </Button>
      </div>
      {state === 'error' && <Alert variant="error">{detail}</Alert>}
    </div>
  )
}
