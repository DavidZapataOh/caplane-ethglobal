import { Icon } from './icon'
import {
  DELIVERABLES,
  EVIDENCE,
  SPONSOR_SCOPE,
  commandFor,
  REGISTRY_ADDRESS,
  type Deliverable,
} from '../lib/landing-data'

const SPONSOR_LABEL: Record<(typeof SPONSOR_SCOPE)[number], string> = {
  chainlink: 'Chainlink — Best Confidential Workflow',
  arc: 'Arc / Circle — Launch on Arc Testnet',
  privy: 'Privy — Best B2B Financial Product',
}

const CATEGORY_LABEL: Record<Deliverable['category'], string> = {
  bounty: 'Required by the sponsors',
  thesis: 'Proves the registry is real',
  differentiator: 'Proven precedent',
}

function groupByCategory(list: readonly Deliverable[]) {
  const groups = new Map<Deliverable['category'], Deliverable[]>()
  for (const d of list) {
    const bucket = groups.get(d.category) ?? []
    bucket.push(d)
    groups.set(d.category, bucket)
  }
  return groups
}

export function Landing() {
  const grouped = groupByCategory(DELIVERABLES)

  return (
    <main className="flex flex-col gap-24 bg-ground pb-24 font-prose text-text">
      {/* Hero — the thesis, no scroll needed */}
      <section className="flex flex-col gap-6 border-b border-border px-6 pt-16 pb-20 sm:px-12">
        <p className="font-display text-[9px] font-medium tracking-[0.22em] text-text-3 uppercase">
          An encrypted lien registry
        </p>
        <h1 className="max-w-3xl font-display text-3xl leading-[1.4] font-medium tracking-[-0.03em] text-text sm:text-4xl">
          The same invoice can&apos;t be pledged twice.
        </h1>
        <p className="max-w-2xl text-base leading-[1.65] text-text-2">
          Caplane is a public registry that only a Chainlink confidential workflow can write to
          &mdash; not the team, not a lender, not the business submitting a claim. Nobody can alter an
          entry, including us.
        </p>
        <div className="flex flex-wrap gap-6 pt-2">
          <a
            href="https://registry.caplane.xyz"
            className="inline-flex items-center gap-2 border border-border-strong px-4 py-2 font-display text-sm font-medium text-text hover:bg-surface"
          >
            <Icon name="lookup" className="size-4" />
            Check the registry
          </a>
          <a
            href="https://github.com/REPLACE_ORG/caplane"
            className="inline-flex items-center gap-2 px-4 py-2 font-display text-sm font-medium text-text-2 hover:text-text"
          >
            Read the source
          </a>
        </div>
      </section>

      {/* Proof — the one collision that already happened on chain */}
      <section className="flex flex-col gap-4 px-6 sm:px-12">
        <p className="font-display text-[9px] font-medium tracking-[0.22em] text-text-3 uppercase">
          What already happened, on chain
        </p>
        <h2 className="flex items-center gap-3 font-display text-xl font-medium tracking-[-0.03em] text-text sm:text-2xl">
          <Icon name="rejected" className="size-5 text-text-2" />A resubmission, rejected 7 of 7.
        </h2>
        <p className="max-w-2xl text-[15px] leading-[1.65] text-text-2">
          The exact same claim was sent to the registry a second time. It was rejected for
          collision &mdash; not by us, by the workflow. A lien was recorded, a resubmission of it
          bounced, and the lien was later released. All three events are on Arc Testnet, not in a
          screenshot.
        </p>
        <a
          href={`https://testnet.arcscan.app/address/${REGISTRY_ADDRESS}#events`}
          className="w-fit border border-border px-3 py-1.5 font-data text-xs text-text-2 hover:border-border-strong hover:text-text"
        >
          block 61,685,965 &rarr; block 61,687,960 &mdash; read the events
        </a>
      </section>

      {/* Sponsors — the three in scope, no more */}
      <section className="flex flex-col gap-4 border-y border-border bg-surface px-6 py-10 sm:px-12">
        <p className="font-display text-[9px] font-medium tracking-[0.22em] text-text-3 uppercase">
          Built for three sponsor bounties
        </p>
        <ul className="flex flex-wrap gap-x-10 gap-y-3 font-display text-sm text-text-2">
          {SPONSOR_SCOPE.map((s) => (
            <li key={s}>{SPONSOR_LABEL[s]}</li>
          ))}
        </ul>
      </section>

      {/* Evidence grid — four real numbers, not adjectives */}
      <section className="flex flex-col gap-6 px-6 sm:px-12">
        <p className="font-display text-[9px] font-medium tracking-[0.22em] text-text-3 uppercase">
          It&apos;s real, and it&apos;s checkable
        </p>
        <div className="grid grid-cols-1 gap-px border border-border bg-border sm:grid-cols-2">
          {EVIDENCE.map((e) => (
            <a
              key={e.id}
              href={e.proofHref}
              className="flex flex-col gap-2 bg-ground p-5 hover:bg-surface"
            >
              <h3 className="font-display text-base font-medium text-text">{e.headline}</h3>
              <p className="text-sm leading-[1.6] text-text-2">{e.detail}</p>
            </a>
          ))}
        </div>
      </section>

      {/* Audiences — one verification command each, real and copyable */}
      <section className="flex flex-col gap-6 px-6 sm:px-12">
        <p className="font-display text-[9px] font-medium tracking-[0.22em] text-text-3 uppercase">
          Verify it yourself
        </p>
        <div className="flex flex-col divide-y divide-border border-y border-border">
          <div className="flex flex-col gap-2 py-5">
            <p className="font-display text-sm font-medium text-text">A business uploading a claim</p>
            <p className="text-sm text-text-2">Nobody can alter the registry, including us:</p>
            <pre className="overflow-x-auto border border-border bg-surface p-3 font-data text-xs text-text-2">
              {commandFor('business', REGISTRY_ADDRESS)}
            </pre>
          </div>
          <div className="flex flex-col gap-2 py-5">
            <p className="font-display text-sm font-medium text-text">A financier deciding whether to lend</p>
            <p className="text-sm text-text-2">Read the registry directly, no account needed:</p>
            <a
              href={commandFor('financier', REGISTRY_ADDRESS)}
              className="w-fit border border-border bg-surface p-3 font-data text-xs text-text-2 hover:text-text"
            >
              {commandFor('financier', REGISTRY_ADDRESS)}
            </a>
          </div>
          <div className="flex flex-col gap-2 py-5">
            <p className="flex items-center gap-2 font-display text-sm font-medium text-text">
              <Icon name="sdk" className="size-4" />A developer integrating the SDK
            </p>
            <p className="text-sm text-text-2">Three lines, no dependency on our app:</p>
            <pre className="overflow-x-auto border border-border bg-surface p-3 font-data text-xs whitespace-pre-wrap text-text-2">
              {commandFor('developer', REGISTRY_ADDRESS)}
            </pre>
          </div>
        </div>
      </section>

      {/* Limits declared — plainly, not buried */}
      <section className="flex flex-col gap-3 px-6 sm:px-12">
        <p className="font-display text-[9px] font-medium tracking-[0.22em] text-text-3 uppercase">
          Declared, not buried
        </p>
        <p className="max-w-2xl text-sm leading-[1.65] text-text-2">
          The registry&apos;s write path has no owner and no admin key &mdash; its trust rests on
          Chainlink&apos;s attested TEE, not on a promise. No lien is active on the registry right
          now: the one that ever existed was already released, which is why this page shows a
          completed cycle instead of a live badge. Both limits are here because an unrebutted
          defect is a full defect.
        </p>
      </section>

      {/* CTA + footer — the 12 deliverables, grouped */}
      <section className="flex flex-col gap-10 border-t border-border px-6 pt-12 sm:px-12">
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-xl font-medium tracking-[-0.03em] text-text">
            Start with the registry.
          </h2>
          <a
            href="https://registry.caplane.xyz"
            className="w-fit border border-border-strong px-4 py-2 font-display text-sm font-medium text-text hover:bg-surface"
          >
            Check a lien &rarr;
          </a>
        </div>
        <div className="grid grid-cols-1 gap-8 border-t border-border pt-8 sm:grid-cols-3">
          {[...grouped.entries()].map(([category, items]) => (
            <div key={category} className="flex flex-col gap-3">
              <p className="font-display text-[9px] font-medium tracking-[0.12em] text-text-3 uppercase">
                {CATEGORY_LABEL[category]}
              </p>
              <ul className="flex flex-col gap-2">
                {items.map((d) => (
                  <li key={d.id}>
                    <a href={d.href} className="text-sm text-text-2 hover:text-text">
                      {d.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
