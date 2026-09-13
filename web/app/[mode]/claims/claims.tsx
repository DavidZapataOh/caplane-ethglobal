'use client'

import { usePrivy, useWallets } from '@privy-io/react-auth'
import {
  type Outcome,
  type Submission,
  createCaplaneClient,
  outcomeOf,
  submissionsOf,
} from 'caplane-sdk'
import { useState } from 'react'
import type { Address } from 'viem'
import { Alert } from '../../../components/alert'
import { Badge } from '../../../components/badge'
import { Button } from '../../../components/button'
import { DataRow } from '../../../components/data-row'
import { Icon } from '../../../components/icon'
import { copyFor } from './rejection-copy'

type Resolved = Submission & { outcome: Outcome }

const usdc = (base: bigint) => `${(Number(base) / 1e6).toFixed(2)} USDC`
const day = (seconds: bigint) => new Date(Number(seconds) * 1000).toISOString().slice(0, 10)

/**
 * Only registry states get a badge. A refusal is a verdict on a submission, not a state of a
 * claim — the semantic table has no row for it, and inventing one would stretch a vocabulary whose
 * whole value is that each mark means one thing.
 */
const BADGE = {
  pending: 'pending',
  active: 'encumbered',
  released: 'released',
  defaulted: 'defaulted',
} as const

/**
 * What became of this organization's own submissions, read from the chain with nothing of ours in
 * the path — the same property the public lookup has, and the reason switching our services off
 * does not change what this page says.
 *
 * Refresh is a button, not a timer. The workflow answers in its own time, and a page that polled
 * would spend a public endpoint's budget on everyone who left a tab open.
 */
export function Claims() {
  const { ready, authenticated, login } = usePrivy()
  const { wallets } = useWallets()
  const [rows, setRows] = useState<Resolved[]>([])
  const [state, setState] = useState<'idle' | 'reading' | 'done' | 'error'>('idle')
  const [detail, setDetail] = useState('')

  const wallet = wallets[0]

  const read = async () => {
    if (wallet === undefined) {
      setState('error')
      setDetail('No wallet is connected.')
      return
    }
    setState('reading')
    try {
      const client = createCaplaneClient()
      const submitter = wallet.address as Address
      const mine = await submissionsOf(client, submitter)
      const resolved: Resolved[] = []
      for (const submission of mine) {
        resolved.push({
          ...submission,
          outcome: await outcomeOf(client, submission.submissionId, submitter, {
            fromBlock: submission.blockNumber,
          }),
        })
      }
      setRows(resolved.sort((a, b) => Number(b.blockNumber - a.blockNumber)))
      setState('done')
    } catch (error) {
      setDetail((error as Error).message)
      setState('error')
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
          <Icon name="organization" /> Sign in to see your claims
        </Button>
      </div>
    )
  }

  return (
    <div className="mt-6 flex max-w-3xl flex-col gap-4">
      <div>
        <Button variant="primary" onClick={() => void read()} disabled={state === 'reading'}>
          <Icon name={state === 'reading' ? 'loading' : 'lookup'} />
          {state === 'reading' ? 'Reading the chain' : 'Refresh'}
        </Button>
      </div>

      {state === 'done' && rows.length === 0 && (
        <p className="font-prose text-text-3">
          Nothing has been submitted from this wallet yet.
        </p>
      )}

      {rows.map((row) => (
        <div key={row.submissionId} className="border border-border">
          <div className="flex items-center gap-3 border-b border-border bg-surface-2 p-3">
            {row.outcome.status === 'rejected' ? (
              <span className="flex items-center gap-2 text-text-2">
                <Icon name="rejected" /> rejected
              </span>
            ) : (
              <Badge variant={BADGE[row.outcome.status]}>{row.outcome.status}</Badge>
            )}
            <span className="text-text-3">block {row.blockNumber.toString()}</span>
          </div>
          <dl className="divide-y divide-border">
            <DataRow label="submission" value={row.submissionId} />
            {row.outcome.status !== 'pending' && row.outcome.status !== 'rejected' && (
              <>
                <DataRow label="advance" value={usdc(row.outcome.lien.advanceUsdc6)} />
                <DataRow label="rate" value={`${row.outcome.lien.rateBps} bps`} />
                <DataRow label="expires" value={day(row.outcome.lien.expiresAt)} />
              </>
            )}
          </dl>
          {row.outcome.status === 'rejected' && (
            <div className="border-t border-border p-3">
              <p className="font-display text-text">{copyFor(row.outcome.reason).headline}</p>
              <p className="mt-1 max-w-prose font-prose text-text-2">
                {copyFor(row.outcome.reason).body}
              </p>
            </div>
          )}
        </div>
      ))}

      {state === 'error' && <Alert variant="error">{detail}</Alert>}
    </div>
  )
}
