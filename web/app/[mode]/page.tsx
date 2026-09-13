import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Icon } from '../../components/icon'

const SURFACES = [
  {
    href: '/registry',
    icon: 'lookup',
    title: 'Look up a lien',
    body: 'Paste a lien id or a borrower address. Your browser reads the chain directly — no account, no key, and nothing of ours in the path.',
  },
  {
    href: '/submit',
    icon: 'contract',
    title: 'Pledge a receivable',
    body: 'Seal a claim in this browser and send it to the inbox. The enclave decides; nobody else can.',
  },
  {
    href: '/claims',
    icon: 'organization',
    title: 'Your claims',
    body: 'What became of everything this wallet submitted, read from the chain and explained.',
  },
  {
    href: '/invest',
    icon: 'usdc',
    title: 'Fund the pool',
    body: 'Deposit USDC against the advances the registry makes, and redeem what the pool holds in cash.',
  },
  {
    href: '/harness',
    // Last of an odd five: spanning both columns closes the grid instead of leaving a hole.
    wide: true,
    icon: 'rejected',
    title: 'The adversarial harness',
    body: 'A worker trying to pledge the same receivable a second time, continuously, refused every time.',
  },
] as const satisfies ReadonlyArray<{
  href: string
  icon: string
  title: string
  body: string
  wide?: boolean
}>

/**
 * The root of both hosts, and they want different things from it.
 *
 * `registry.caplane.xyz` exists to answer one question, so it goes straight to the lookup rather
 * than asking a visitor to find it — this page used to be a placeholder, and anyone following a
 * link to the public registry landed on a heading and one sentence.
 *
 * The app's root is a different job: it is the only page that says what the surfaces are.
 */
export default async function Page({ params }: PageProps<'/[mode]'>) {
  const { mode } = await params
  if (mode === 'paper') redirect('/registry')

  return (
    <main className="flex-1 py-16">
      <p className="font-display text-[10px] font-medium tracking-[0.22em] text-text-3 uppercase">
        Arc Testnet
      </p>
      <h1 className="mt-5 max-w-[20ch] font-display text-4xl leading-[1.15] font-medium tracking-[-0.03em] text-balance text-text sm:text-5xl">
        An encrypted lien registry, writable only from inside a TEE.
      </h1>
      <p className="mt-6 max-w-2xl font-prose text-lg leading-[1.6] text-pretty text-text-2">
        Five surfaces, one registry. Only the first needs nothing from you.
      </p>

      <dl className="mt-12 grid gap-px border border-border bg-border sm:grid-cols-2">
        {SURFACES.map((surface) => (
          <Link
            key={surface.href}
            href={surface.href}
            className={`flex flex-col gap-2 bg-surface p-6 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-text${
              'wide' in surface && surface.wide ? ' sm:col-span-2' : ''
            }`}
          >
            <dt className="flex items-center gap-2.5 font-display text-base font-medium text-text">
              <Icon name={surface.icon} className="size-4 shrink-0 text-text-3" />
              {surface.title}
            </dt>
            <dd className="font-prose text-sm leading-[1.6] text-text-2">{surface.body}</dd>
          </Link>
        ))}
      </dl>

      <p className="mt-10 max-w-2xl font-prose text-sm leading-[1.65] text-text-3">
        Only the lookup needs nothing from you. The others sign with a wallet, and the registry does
        not care which one — it accepts a write from the network&apos;s forwarder and from no one
        else, including us.
      </p>
    </main>
  )
}
