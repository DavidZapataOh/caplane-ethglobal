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
    icon: 'rejected',
    title: 'The adversarial harness',
    body: 'A worker trying to pledge the same receivable a second time, continuously, refused every time.',
  },
] as const

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
    <main className="flex-1 p-8 font-data text-text-2">
      <h1 className="font-display text-2xl text-text">Caplane</h1>
      <p className="mt-2 flex items-center gap-2 text-seal-text">
        <Icon name="encumbered" />
        An encrypted lien registry writable only from inside a TEE.
      </p>

      <dl className="mt-8 flex max-w-3xl flex-col divide-y divide-border border border-border">
        {SURFACES.map((surface) => (
          <Link
            key={surface.href}
            href={surface.href}
            className="flex flex-col gap-1 p-4 hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-text"
          >
            <dt className="flex items-center gap-2 font-display text-text">
              <Icon name={surface.icon} />
              {surface.title}
            </dt>
            <dd className="max-w-prose font-prose text-text-2">{surface.body}</dd>
          </Link>
        ))}
      </dl>

      <p className="mt-8 max-w-prose font-prose text-text-3">
        Only the lookup needs nothing from you. The others sign with a wallet, and the registry does
        not care which one — it accepts a write from the network&apos;s forwarder and from no one
        else, including us.
      </p>
    </main>
  )
}
