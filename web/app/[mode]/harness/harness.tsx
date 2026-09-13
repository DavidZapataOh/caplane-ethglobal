'use client'

import { useEffect, useState } from 'react'
import { Alert } from '../../../components/alert'
import { Badge } from '../../../components/badge'
import { DataRow } from '../../../components/data-row'
import { Icon } from '../../../components/icon'
import { type Row, readSeries } from './series'
import { REASON_LABEL } from './series'
import { reformattingRows } from './reformatting'

const SUBMITTER = '0xA687F2A567B6d26Dd0E45F08d5ec40f0a25454e7'
const short = (value: string) => `${value.slice(0, 10)}…${value.slice(-6)}`

/**
 * A worker attempts the same pledged receivable, for ever, and the registry refuses it every time.
 *
 * Read from the chain and from nothing else. That is not only the guarantee the public lookup
 * already makes — it is what lets this page keep answering while our own indexer is switched off,
 * which is the demonstration the rest of the system is built to survive.
 */
export function Harness() {
  const [rows, setRows] = useState<Row[]>([])
  const [state, setState] = useState<'reading' | 'done' | 'error'>('reading')
  const [detail, setDetail] = useState('')

  useEffect(() => {
    readSeries(SUBMITTER)
      .then((series) => {
        setRows(series)
        setState('done')
      })
      .catch((error: Error) => {
        setDetail(error.message)
        setState('error')
      })
  }, [])

  // Only once the chain has actually answered. A count rendered while the read is failing is a
  // zero a reader takes for a fact — and the fact it states, that the worker never bounced, is the
  // opposite of the truth the page exists to show.
  const counted = state === 'done'
  const bounced = counted ? String(rows.filter((row) => row.reason === 1).length) : '—'
  const other = counted
    ? String(rows.filter((row) => row.reason !== undefined && row.reason !== 1).length)
    : '—'

  return (
    <div className="mt-6 flex max-w-3xl flex-col gap-8">
      <p className="max-w-prose font-prose text-text-2">
        A worker submits the same already-pledged receivable again and again, from its own funded
        address. Every attempt is refused. Nothing below is served by us: the page reads the inbox
        and the registry directly, so it keeps answering when our own services are switched off.
      </p>

      <dl className="border border-border">
        <DataRow label="submitter" value={SUBMITTER} />
        <DataRow label="refused as already pledged" value={bounced} />
        <DataRow label="refused for another reason" value={other} />
      </dl>

      {state === 'reading' && (
        <p className="flex items-center gap-2">
          <Icon name="loading" /> Reading the chain.
        </p>
      )}

      {state === 'done' && rows.length === 0 && (
        <p className="font-prose text-text-3">
          No attempt from this address in the window this page reads.
        </p>
      )}

      {rows.length > 0 && (
        <dl className="divide-y divide-border border border-border">
          {rows.map((row) => (
            <div key={row.submissionId} className="flex items-center gap-4 p-3">
              <dt className="flex-1 font-data text-text-2">{short(row.submissionId)}</dt>
              <dd className="flex items-center gap-3">
                <span className="font-data text-text-3">
                  block {String(row.decidedAt ?? row.submittedAt)}
                </span>
                {/* Named, never only coloured: a red row says the registry refused, and only the
                    name says it refused because the receivable was already pledged. */}
                {row.reason === undefined ? (
                  <span className="flex items-center gap-2 text-text-3">
                    <Icon name="loading" /> waiting
                  </span>
                ) : row.reason === 1 ? (
                  <Badge variant="encumbered">{REASON_LABEL[1]}</Badge>
                ) : (
                  <span className="flex items-center gap-2 text-text-2">
                    <Icon name="rejected" /> {REASON_LABEL[row.reason] ?? `reason ${row.reason}`}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-text">The same receivable, written differently</h2>
        <p className="max-w-prose font-prose text-text-2">
          Reformatting is refused before it reaches the collision check, not by it. The ledger pins
          the invoice number, the amount, the currency and the due date, and the enclave replaces
          the debtor, the issuer and the country with the book&apos;s own values — so on chain this
          can only ever be seven of seven. The scores below are what the index would answer if a
          reformatted claim ever got that far, computed with the matcher the enclave itself runs.
        </p>
        <dl className="divide-y divide-border border border-border">
          {reformattingRows().map((row) => (
            <div key={row.label} className="flex items-center gap-4 p-3">
              <dt className="flex-1 font-prose text-text-2">{row.label}</dt>
              <dd className="font-data text-text">
                {row.agreed} of 7 — {row.collides ? 'refused' : 'a different receivable'}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {state === 'error' && <Alert variant="error">{detail}</Alert>}
    </div>
  )
}
