'use client'

import { useState } from 'react'
import { Alert } from '../../../components/alert'
import { Badge } from '../../../components/badge'
import { DataRow } from '../../../components/data-row'
import { Icon } from '../../../components/icon'
import { type Reading, classify, normalise, read } from './chain.ts'
import { type Recorded, explain, liensOf } from './history.ts'

/** 0 is not a status the registry stores — it is the absence of a record. */
const STATUS = ['no record', 'encumbered', 'released', 'defaulted'] as const

const REASONS = [
  'unset',
  'already encumbered',
  'debtor unconfirmed',
  'compliance hit',
  'source unverified',
  'below threshold',
  'unauthorised submitter',
  'malformed claim',
  'verification unavailable',
  'malformed envelope',
] as const

const usdc = (base: bigint) => `${(Number(base) / 1e6).toFixed(2)} USDC`
const instant = (seconds: bigint) => new Date(Number(seconds) * 1000).toISOString().slice(0, 10)

type Answer =
  | { kind: 'lien'; id: string; reading: Reading; why?: string }
  | { kind: 'borrower'; address: string; found: Recorded[] }

export function Lookup() {
  const [input, setInput] = useState('')
  const [state, setState] = useState<'idle' | 'reading' | 'done' | 'error'>('idle')
  const [detail, setDetail] = useState('')
  const [answer, setAnswer] = useState<Answer | undefined>()
  const [copied, setCopied] = useState('')

  const curlFor = (reading: Reading) =>
    reading.receipt.calls
      .map(
        (call) =>
          `curl -s -X POST ${reading.receipt.endpoint} -H 'content-type: application/json' \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"to":"${reading.receipt.to}","data":"${call.data}"},"${reading.receipt.blockNumber}"]}'`,
      )
      .join('\n\n')

  const copy = (what: string, value: string) => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(what)
      setTimeout(() => setCopied(''), 1500)
    })
  }

  const look = async () => {
    const kind = classify(input)
    if (kind === 'invalid') {
      setState('error')
      setDetail('That is neither a 32-byte lien id nor a 20-byte address.')
      return
    }
    setState('reading')
    try {
      if (kind === 'lien') {
        const id = normalise(input)
        const reading = await read(id)
        // Only asked when the call came back empty: the contract cannot tell a refusal from an id
        // it never saw, and the logs can. If the log read fails the status stands without a reason
        // rather than the page inventing one.
        const why = reading.status === 0 ? await explain(id) : undefined
        setAnswer({ kind: 'lien', id, reading, ...(why === undefined ? {} : { why }) })
      } else {
        const address = normalise(input)
        setAnswer({ kind: 'borrower', address, found: await liensOf(address) })
      }
      setState('done')
    } catch (error) {
      setState('error')
      setDetail((error as Error).message)
    }
  }

  return (
    <div className="mt-6 max-w-3xl">
      <div className="flex border border-border">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void look()
          }}
          placeholder="0x… a lien id, or a borrower address"
          aria-label="A lien id or a borrower address"
          className="flex-1 bg-surface p-3 font-data text-text outline-none placeholder:text-text-3"
        />
        <button
          type="button"
          onClick={() => void look()}
          className="flex items-center gap-2 border-l border-border bg-surface-2 px-4 text-text hover:bg-surface"
        >
          <Icon name="lookup" /> Look up
        </button>
      </div>

      {state === 'reading' && (
        <p className="mt-4 flex items-center gap-2">
          <Icon name="loading" /> Reading the chain.
        </p>
      )}

      {state === 'error' && (
        <div className="mt-4">
          <Alert variant="error">{detail}</Alert>
        </div>
      )}

      {state === 'done' && answer?.kind === 'lien' && (
        <div className="mt-4 border border-border">
          <div className="flex items-center gap-3 border-b border-border bg-surface-2 p-3">
            {/* The seal appears only for an active lien. Nothing else in the brand may wear it. */}
            <Badge
              variant={
                answer.reading.status === 1 ? 'encumbered' : answer.reading.status === 0 ? 'free' : 'released'
              }
            >
              {answer.reading.status === 1
                ? 'ENCUMBERED'
                : (STATUS[answer.reading.status] ?? `status ${answer.reading.status}`)}
            </Badge>
            {answer.why !== undefined && (
              <span className="text-text-3">
                {answer.why === 'unknown'
                  ? 'the registry has never seen this id'
                  : answer.why === 'released'
                    ? 'released earlier'
                    : `the enclave refused this submission — ${REASONS[Number(answer.why.split(':')[1])] ?? answer.why}`}
              </span>
            )}
          </div>
          <dl className="divide-y divide-border">
            {[
              ['lien id', answer.id],
              ['borrower', answer.reading.lien.borrower],
              ['advance', usdc(answer.reading.lien.advanceUsdc6)],
              ['rate', `${answer.reading.lien.rateBps} bps`],
              ['recorded', answer.reading.lien.createdAt === 0n ? '—' : instant(answer.reading.lien.createdAt)],
              ['expires', answer.reading.lien.expiresAt === 0n ? '—' : instant(answer.reading.lien.expiresAt)],
              ['submission', answer.reading.lien.submissionId],
              ['read at block', BigInt(answer.reading.receipt.blockNumber).toString()],
            ].map(([label, value]) => (
              <DataRow
                key={label}
                label={label as string}
                value={value as string}
                {...(label === 'lien id' || label === 'submission'
                  ? { onCopy: () => copy(label as string, value as string) }
                  : {})}
              />
            ))}
          </dl>
          <details className="border-t border-border p-3">
            <summary className="cursor-pointer text-text-2">Check this yourself</summary>
            <p className="mt-2 max-w-prose font-prose text-text-3">
              The three calls behind the answer above, pinned to the block it was read at. Run them
              against any node and compare the bytes — nothing here asks you to believe us.
            </p>
            <pre className="mt-2 overflow-x-auto bg-surface-2 p-3 text-text-2">{curlFor(answer.reading)}</pre>
            <button type="button" onClick={() => copy('curl', curlFor(answer.reading))} className="mt-2 flex items-center gap-2 text-text-3 hover:text-text">
              <Icon name="copy" /> {copied === 'curl' ? 'copied' : 'copy the commands'}
            </button>
          </details>
        </div>
      )}

      {state === 'done' && answer?.kind === 'borrower' && (
        <div className="mt-4 border border-border">
          <p className="border-b border-border bg-surface-2 p-3 text-text">
            {answer.found.length === 0
              ? 'Nothing has ever been recorded against this address.'
              : `${answer.found.length} lien${answer.found.length === 1 ? '' : 's'} recorded against this address.`}
          </p>
          <dl className="divide-y divide-border">
            {answer.found.map((lien) => (
              <DataRow
                key={lien.lienId}
                label={`block ${lien.blockNumber.toString()}`}
                value={lien.lienId}
                onCopy={() => copy(lien.lienId, lien.lienId)}
              />
            ))}
          </dl>
          <p className="border-t border-border p-3 font-prose text-text-3">
            Assembled from the registry’s own events, read from the deployment block by your browser.
            One endpoint answered: an endpoint that omitted an event would show less pledged than
            there is.
          </p>
        </div>
      )}

      {copied !== '' && copied !== 'curl' && <p className="mt-2 text-text-3">copied</p>}
    </div>
  )
}
