import type { ReactNode } from 'react'
import Link from 'next/link'
import { Icon } from './icon'
import type { IconName } from '@caplane/brand/icon-names'
import {
  DELIVERABLES,
  EVIDENCE,
  REGISTRY_ADDRESS,
  REPO_URL,
  commandFor,
  isPlaceholder,
  type Deliverable,
} from '../lib/landing-data'

const APP = 'https://app.caplane.xyz'
const REGISTRY = 'https://registry.caplane.xyz'
const ARCSCAN = 'https://testnet.arcscan.app/address'

const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`

const primary =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap bg-text px-5 py-3 font-display text-sm font-medium text-ground transition-colors hover:bg-on-seal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text'
const secondary =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap border border-border-strong px-5 py-3 font-display text-sm font-medium text-text transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text'

function Announcement() {
  return (
    <a
      href={`${ARCSCAN}/${REGISTRY_ADDRESS}#events`}
      className="flex items-center justify-center gap-3 border-b border-border bg-surface-2 px-6 py-2.5 text-center text-sm text-text-2 hover:text-text"
    >
      <Icon name="block" className="size-4 shrink-0" />
      <span>
        Live on Arc Testnet<span className="max-sm:hidden">: a lien recorded, a duplicate refused, the lien released</span>
      </span>
      <span className="font-display text-xs whitespace-nowrap text-text">Read the events &rarr;</span>
    </a>
  )
}

function Nav() {
  const links = [
    ['Registry', REGISTRY],
    ['App', APP],
    ['SDK', 'https://www.npmjs.com/package/caplane-sdk'],
    ['Evidence', `${REPO_URL}/tree/main/evidence`],
    ['Source', REPO_URL],
  ] as const
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-ground/95 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
        <Link href="/" className="font-display text-lg font-medium tracking-[-0.03em] text-text">
          Caplane
        </Link>
        <ul className="hidden items-center gap-8 text-sm text-text-2 md:flex">
          {links.map(([label, href]) => (
            <li key={label}>
              <a href={href} className="hover:text-text">
                {label}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-3">
          <a href={REGISTRY} className={`${secondary} px-4 py-2 max-sm:hidden`}>
            Check a lien
          </a>
          <a href={APP} className={`${primary} px-4 py-2`}>
            Open the app
          </a>
        </div>
      </nav>
    </header>
  )
}

function Hero() {
  return (
    <section className="mx-auto flex max-w-6xl flex-col items-center px-6 pt-20 pb-16 text-center sm:pt-28">
      <h1 className="max-w-[16ch] font-display text-4xl leading-[1.15] font-medium tracking-[-0.03em] text-balance text-text sm:text-6xl">
        The same invoice can&apos;t be pledged twice.
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-[1.6] text-pretty text-text-2">
        A public lien registry that only a confidential workflow can write to. Not us, not a lender,
        not the business asking for money.
      </p>
      <div className="mt-10 flex w-full max-w-xl flex-col border border-border-strong bg-surface sm:flex-row">
        <span className="flex flex-1 items-center gap-3 px-4 py-3 text-left font-data text-sm text-text-3">
          <Icon name="contract" className="size-4 shrink-0" />
          <span className="truncate">CaplaneRegistry {short(REGISTRY_ADDRESS)}</span>
        </span>
        <a href={REGISTRY} className={primary}>
          Check a lien
        </a>
      </div>
      <p className="mt-4 text-sm text-text-3">No account. It reads the chain from your browser.</p>
    </section>
  )
}

type ActivityRow = {
  icon: IconName
  title: string
  body: string
  status: ReactNode
  meta: string
}

function ProductPanel() {
  const rows: ActivityRow[] = [
    {
      icon: 'invoice',
      title: 'Invoice claim recorded',
      body: 'Verified against the accounting system, screened, confirmed by the debtor, underwritten.',
      status: (
        <span className="bg-seal px-2 py-1 font-display text-[10px] font-semibold tracking-[0.12em] text-on-seal uppercase">
          Encumbered
        </span>
      ),
      meta: 'block 61,685,965',
    },
    {
      icon: 'rejected',
      title: 'This claim is already pledged',
      body: 'A live lien covers it. The registry does not disclose anything further about that lien.',
      status: (
        <span className="border border-border-strong px-2 py-1 font-display text-[10px] font-semibold tracking-[0.12em] text-text-2 uppercase">
          Refused · 7 of 7
        </span>
      ),
      meta: 'resubmission',
    },
    {
      icon: 'released',
      title: 'Advance repaid, lien released',
      body: 'The escrow settled and the receivable is free to finance again.',
      status: (
        <span className="bg-surface-2 px-2 py-1 font-display text-[10px] font-semibold tracking-[0.12em] text-text-3 uppercase">
          Released
        </span>
      ),
      meta: 'block 61,687,960',
    },
  ]
  const sidebar: [IconName, string][] = [
    ['invoice', 'Submit'],
    ['commitment', 'Claims'],
    ['pool', 'Invest'],
    ['lookup', 'Registry'],
  ]

  return (
    <section className="mx-auto max-w-6xl px-6">
      <div className="border border-border-strong bg-surface">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="size-2.5 bg-border-strong" />
          <span className="size-2.5 bg-border-strong" />
          <span className="size-2.5 bg-border-strong" />
          <span className="ml-3 font-data text-xs text-text-3">app.caplane.xyz/claims</span>
        </div>
        <div className="grid md:grid-cols-[200px_1fr]">
          <aside className="hidden border-r border-border p-3 md:block">
            <ul className="flex flex-col gap-1 text-sm">
              {sidebar.map(([icon, label]) => (
                <li
                  key={label}
                  className={`flex items-center gap-2.5 px-3 py-2 ${
                    label === 'Claims' ? 'bg-surface-2 text-text' : 'text-text-3'
                  }`}
                >
                  <Icon name={icon} className="size-4" />
                  {label}
                </li>
              ))}
            </ul>
          </aside>
          <div className="p-5 sm:p-8">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-lg font-medium text-text">One receivable, three verdicts</h2>
              <span className="font-data text-xs text-text-3">Arc Testnet · chain 5042002</span>
            </div>
            <ul className="mt-6 divide-y divide-border border-y border-border">
              {rows.map((r) => (
                <li key={r.title} className="grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="flex gap-3">
                    <Icon name={r.icon} className="mt-0.5 size-5 shrink-0 text-text-2" />
                    <div>
                      <p className="text-sm font-medium text-text">{r.title}</p>
                      <p className="mt-1 max-w-xl text-sm leading-[1.6] text-text-2">{r.body}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 pl-8 sm:flex-col sm:items-end sm:gap-2 sm:pl-0">
                    {r.status}
                    <span className="font-data text-xs text-text-3 tabular-nums">{r.meta}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-text-3">
        A replay of the cycle recorded on Arc Testnet between blocks 61,685,965 and 61,687,960. No
        lien is active right now.
      </p>
    </section>
  )
}

function BuiltOn() {
  return (
    <section className="mx-auto mt-24 max-w-6xl border-y border-border px-6 py-12">
      <p className="text-center font-display text-[11px] font-medium tracking-[0.22em] text-text-3 uppercase">
        Built on the infrastructure it depends on
      </p>
      <ul className="mt-8 grid grid-cols-1 gap-6 text-center sm:grid-cols-3">
        {[
          ['Chainlink', 'Confidential workflow in a TEE'],
          ['Arc by Circle', 'USDC-native settlement'],
          ['Privy', 'Organization wallets and policies'],
        ].map(([name, role]) => (
          <li key={name} className="flex flex-col gap-1">
            <span className="font-display text-2xl font-medium tracking-[-0.03em] text-text">{name}</span>
            <span className="text-sm text-text-3">{role}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Widget({ children }: { children: ReactNode }) {
  return <div className="mt-6 min-w-0 flex-1 border border-border bg-ground p-4">{children}</div>
}

function Row({ label, value, tone = 'text-text-2' }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-xs">
      <span className="text-text-3">{label}</span>
      <span className={`font-data tabular-nums ${tone}`}>{value}</span>
    </div>
  )
}

function Features() {
  const cards: { title: string; body: string; href: string; widget: ReactNode }[] = [
    {
      title: 'Registry',
      body: 'Anyone can ask whether a receivable is already pledged, straight from the chain.',
      href: REGISTRY,
      widget: (
        <Widget>
          <p className="font-data text-xs text-text-3">statusOf(lienId)</p>
          <div className="mt-3 divide-y divide-border">
            <Row label="Status" value="Released" />
            <Row label="Recorded" value="61,685,965" />
            <Row label="Released" value="61,687,960" />
            <Row label="Owner" value="none" />
          </div>
        </Widget>
      ),
    },
    {
      title: 'Confidential verification',
      body: 'The claim is checked inside an enclave. Only the verdict leaves it.',
      href: `${REPO_URL}/tree/main/caplane-workflow`,
      widget: (
        <Widget>
          <ul className="flex flex-col gap-2.5 text-xs">
            {[
              ['Invoice found in the accounting system', false],
              ['Sanctions screening clear', false],
              ['No collision in the registry', false],
              ['Debtor confirmation signed', true],
              ['Underwritten by fixed rules', false],
            ].map(([step, verified]) => (
              <li key={step as string} className="flex items-center gap-2.5">
                <Icon
                  name="verified"
                  className={`size-4 shrink-0 ${verified ? 'text-verified-text' : 'text-text-3'}`}
                />
                <span className="text-text-2">{step}</span>
              </li>
            ))}
          </ul>
        </Widget>
      ),
    },
    {
      title: 'Fuzzy collision check',
      body: 'A reformatted duplicate still collides. Seven fields compared, six are enough.',
      href: `${REPO_URL}/tree/main/evidence/claim`,
      widget: (
        <Widget>
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 7 }, (_, i) => (
              <span key={i} className="aspect-square border border-border-strong bg-text-2" />
            ))}
          </div>
          <div className="mt-4 divide-y divide-border">
            <Row label="Matched" value="7 of 7" tone="text-text" />
            <Row label="Threshold" value="6" />
            <Row label="False matches" value="0.111%" />
          </div>
        </Widget>
      ),
    },
    {
      title: 'Organization wallets',
      body: 'A company signs up with a treasury, and its own policy refuses what it should.',
      href: `${APP}/signup`,
      widget: (
        <Widget>
          <div className="divide-y divide-border">
            <div className="flex items-start gap-2.5 py-2 text-xs">
              <Icon name="signer" className="mt-0.5 size-4 shrink-0 text-verified-text" />
              <span className="text-text-2">Transfer under the threshold: signed</span>
            </div>
            <div className="flex items-start gap-2.5 py-2 text-xs">
              <Icon name="policy" className="mt-0.5 size-4 shrink-0 text-text" />
              <span className="text-text">
                Blocked by treasury policy: this transfer is at or above the approval threshold.
              </span>
            </div>
          </div>
        </Widget>
      ),
    },
    {
      title: 'Pool',
      body: 'Investors fund advances in USDC and redeem what the pool holds in cash.',
      href: `${APP}/invest`,
      widget: (
        <Widget>
          <div className="divide-y divide-border">
            <Row label="Advance disbursed" value="8.00 USDC" tone="text-text" />
            <Row label="Advance rate" value="2%" />
            <Row label="Disbursed by" value="debtor account" />
            <Row label="Settled by" value="investor account" />
          </div>
        </Widget>
      ),
    },
    {
      title: 'SDK',
      body: 'Check a lien in three lines, without going through our app at all.',
      href: 'https://www.npmjs.com/package/caplane-sdk',
      widget: (
        <Widget>
          <pre className="overflow-x-auto font-data text-[11px] leading-[1.7] whitespace-pre text-text-2">
            {commandFor('developer', REGISTRY_ADDRESS)}
          </pre>
        </Widget>
      ),
    },
  ]

  return (
    <section className="mx-auto mt-28 max-w-6xl px-6">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-display text-3xl font-medium tracking-[-0.03em] text-balance text-text sm:text-4xl">
          Every side of the deal, one registry.
        </h2>
        <p className="mt-4 text-lg text-text-2">Record, refuse, fund and verify, each from its own surface.</p>
      </div>
      <div className="mt-12 grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <a key={c.title} href={c.href} className="group flex min-w-0 flex-col bg-surface p-6 hover:bg-surface-2">
            <h3 className="font-display text-base font-medium text-text">{c.title}</h3>
            <p className="mt-2 text-sm leading-[1.6] text-text-2">{c.body}</p>
            {c.widget}
          </a>
        ))}
      </div>
    </section>
  )
}

function Segments() {
  const segments = [
    {
      who: 'For businesses',
      line: 'Get an advance without handing over your customer list.',
      body: 'The invoice is encrypted in your browser before it leaves. Your company gets its own account with a treasury policy; there is no wallet to install.',
      cta: 'Submit a claim',
      href: `${APP}/submit`,
    },
    {
      who: 'For financiers',
      line: 'Know a receivable is free before you fund it.',
      body: 'Ask the registry directly. If another lender already holds a lien, it says so, and says nothing about who they are or what the invoice was.',
      cta: 'Check a lien',
      href: REGISTRY,
    },
    {
      who: 'For developers',
      line: 'Read any lien without trusting our servers.',
      body: 'The SDK queries two RPCs and refuses a contract whose workflow name is not the frozen one. It never calls a caplane.xyz host.',
      cta: 'Install the SDK',
      href: 'https://www.npmjs.com/package/caplane-sdk',
    },
  ]
  return (
    <section className="mx-auto mt-28 max-w-6xl px-6">
      <h2 className="max-w-2xl font-display text-3xl font-medium tracking-[-0.03em] text-balance text-text sm:text-4xl">
        Built for everyone who touches a receivable.
      </h2>
      <div className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
        {segments.map((s) => (
          <div key={s.who} className="flex flex-col border-t border-border-strong pt-6">
            <p className="font-display text-sm text-text-3">{s.who}</p>
            <p className="mt-3 font-display text-xl leading-[1.35] font-medium tracking-[-0.02em] text-text">
              {s.line}
            </p>
            <p className="mt-4 flex-1 text-[15px] leading-[1.65] text-text-2">{s.body}</p>
            <a href={s.href} className="mt-6 font-display text-sm text-text hover:underline hover:underline-offset-4">
              {s.cta} &rarr;
            </a>
          </div>
        ))}
      </div>
    </section>
  )
}

function Receipts() {
  const icons: Record<(typeof EVIDENCE)[number]['id'], IconName> = {
    contracts: 'contract',
    tests: 'hash',
    cycle: 'block',
    fmr: 'k-of-n',
  }
  return (
    <section className="mt-28 border-y border-border bg-surface py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="font-display text-[11px] font-medium tracking-[0.22em] text-text-3 uppercase">
              Verify it yourself
            </p>
            <h2 className="mt-3 max-w-xl font-display text-3xl font-medium tracking-[-0.03em] text-balance text-text sm:text-4xl">
              Every claim on this page has a receipt.
            </h2>
          </div>
          <a href={`${REPO_URL}/tree/main/evidence`} className={secondary}>
            Explore the evidence &rarr;
          </a>
        </div>
        <div className="mt-12 flex snap-x gap-px overflow-x-auto border border-border bg-border">
          {EVIDENCE.map((e) => (
            <a
              key={e.id}
              href={e.proofHref}
              className="flex min-w-[260px] flex-1 snap-start flex-col bg-ground p-6 hover:bg-surface-2"
            >
              <Icon name={icons[e.id]} className="size-6 text-text-2" />
              <p className="mt-6 font-display text-lg font-medium text-text">{e.headline}</p>
              <p className="mt-2 text-sm leading-[1.6] text-text-2">{e.detail}</p>
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}

function Quote() {
  return (
    <section className="mx-auto mt-28 max-w-4xl px-6 text-center">
      <p className="font-display text-3xl leading-[1.3] font-medium tracking-[-0.03em] text-balance text-text sm:text-4xl">
        &ldquo;Nobody can alter an entry, including us.&rdquo;
      </p>
      <p className="mt-6 text-text-2">
        The registry has no owner, no pause and no upgrade path. One line proves it:
      </p>
      <pre className="mx-auto mt-6 max-w-full overflow-x-auto border border-border bg-surface px-4 py-3 text-left font-data text-xs text-text-2 sm:w-fit">
        {commandFor('business', REGISTRY_ADDRESS)}
      </pre>
    </section>
  )
}

function Limits() {
  const limits = [
    {
      title: 'Trust rests on the enclave',
      body: 'Confidentiality depends on hardware attestation, not on pure cryptography. We say so rather than hide it.',
    },
    {
      title: 'No lien is active today',
      body: 'The only lien recorded so far has been repaid and released, which is why the panel above is a replay.',
    },
    {
      title: 'Our API is disposable',
      body: 'If api.caplane.xyz goes dark, every lien stays readable from a block explorer.',
    },
  ]
  return (
    <section className="mx-auto mt-28 max-w-6xl px-6">
      <h2 className="font-display text-3xl font-medium tracking-[-0.03em] text-text sm:text-4xl">
        Declared, not buried.
      </h2>
      <div className="mt-10 grid gap-px border border-border bg-border md:grid-cols-3">
        {limits.map((l) => (
          <div key={l.title} className="bg-surface p-6">
            <p className="font-display text-base font-medium text-text">{l.title}</p>
            <p className="mt-3 text-sm leading-[1.65] text-text-2">{l.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function FinalCta() {
  return (
    <section className="mt-28 border-y border-border bg-surface-2 px-6 py-24 text-center">
      <h2 className="mx-auto max-w-[18ch] font-display text-4xl font-medium tracking-[-0.03em] text-balance text-text sm:text-5xl">
        The registry capital was missing.
      </h2>
      <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
        <a href={REGISTRY} className={primary}>
          Check a lien
        </a>
        <a href={APP} className={secondary}>
          Open the app
        </a>
      </div>
    </section>
  )
}

const CATEGORY_LABEL: Record<Deliverable['category'], string> = {
  bounty: 'Product',
  thesis: 'Verify',
  differentiator: 'Build on it',
}

function Footer() {
  const groups = Object.entries(CATEGORY_LABEL).map(([category, label]) => ({
    label,
    items: DELIVERABLES.filter((d) => d.category === category && d.href !== '/'),
  }))
  const contracts = [
    ['Registry', REGISTRY_ADDRESS],
    ['Inbox', '0xc5218fd1b6eb7c91f905871301bf8620bc8baf91'],
    ['Pool', '0x4df4c8d722b3a9ebd18b9094c883b5ff83565d7c'],
    ['Escrow', '0x2bc74ceb10287890fb9be43667a55b73e080db1f'],
  ] as const

  return (
    <footer className="mx-auto max-w-6xl px-6 pt-20 pb-12">
      <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-1">
          <p className="font-display text-lg font-medium text-text">Caplane</p>
          <p className="mt-3 text-sm leading-[1.6] text-text-3">
            Capital plane: the layer that records which capital is already committed.
          </p>
        </div>
        {groups.map((g) => (
          <div key={g.label}>
            <p className="font-display text-xs font-medium tracking-[0.12em] text-text-3 uppercase">{g.label}</p>
            <ul className="mt-4 flex flex-col gap-2.5 text-sm">
              {g.items.map((d) => (
                <li key={d.id}>
                  {isPlaceholder(d.href) ? (
                    <span className="text-text-3">{d.label} · soon</span>
                  ) : (
                    <a href={d.href} className="text-text-2 hover:text-text">
                      {d.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div>
          <p className="font-display text-xs font-medium tracking-[0.12em] text-text-3 uppercase">Contracts</p>
          <ul className="mt-4 flex flex-col gap-2.5 text-sm">
            {contracts.map(([name, address]) => (
              <li key={name}>
                <a href={`${ARCSCAN}/${address}`} className="flex justify-between gap-3 text-text-2 hover:text-text">
                  {name}
                  <span className="font-data text-xs text-text-3">{short(address)}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-16 flex flex-wrap justify-between gap-4 border-t border-border pt-6 text-xs text-text-3">
        <span>MIT licensed · Fonts under SIL OFL 1.1</span>
        <a href={REPO_URL} className="hover:text-text">
          github.com/DavidZapataOh/caplane-ethglobal
        </a>
      </div>
    </footer>
  )
}

export function Landing() {
  return (
    <div className="bg-ground font-prose text-text">
      <Announcement />
      <Nav />
      <main>
        <Hero />
        <ProductPanel />
        <BuiltOn />
        <Features />
        <Segments />
        <Receipts />
        <Quote />
        <Limits />
        <FinalCta />
      </main>
      <Footer />
    </div>
  )
}
