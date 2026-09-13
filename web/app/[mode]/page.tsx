import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { IconName } from '@caplane/brand/icon-names'
import { Icon } from '../../components/icon'

type Step = { href: string; icon: IconName; title: string; needs: string; body: string }

/**
 * The order a business actually moves in. A treasury wallet has to exist before a claim can name a
 * creditor, and a claim cannot be sealed until the customer has signed — so the steps are numbered
 * and each one states what it needs, rather than five equal cards a first-time visitor has to rank
 * for themselves.
 */
const STEPS: readonly Step[] = [
  {
    href: '/signup',
    icon: 'organization',
    title: 'Create your organisation',
    needs: 'Needs an email. About a minute.',
    body: 'Sets up a treasury wallet for the company, with a spending policy on it.',
  },
  {
    href: '/submit',
    icon: 'contract',
    title: 'Pledge a receivable',
    needs: 'Needs the invoice in your accounting ledger, and your customer to confirm by email.',
    body: 'Your browser encrypts the invoice before it is sent. Only the enclave can read it, and only it decides.',
  },
  {
    href: '/claims',
    icon: 'lookup',
    title: 'See what was decided',
    needs: 'Nothing, once you have pledged something.',
    body: 'Recorded, refused, or still waiting — with the reason, read from the chain.',
  },
] as const

const ELSEWHERE: readonly Step[] = [
  {
    href: '/registry',
    icon: 'contract',
    title: 'Check whether a receivable is pledged',
    needs: 'No account, no wallet.',
    body: 'For a lender doing diligence on a claim someone else brought them.',
  },
  {
    href: '/invest',
    icon: 'usdc',
    title: 'Fund the pool',
    needs: 'Needs a wallet with USDC.',
    body: 'For an investor. Deposit against the advances the registry makes, and redeem.',
  },
  {
    href: '/harness',
    icon: 'rejected',
    title: 'Watch a double pledge fail',
    needs: 'Nothing. It runs on its own.',
    body: 'A worker attempting the same pledged receivable over and over, refused every time.',
  },
] as const

const Card = ({ step, number }: { step: Step; number?: number }) => (
  <Link
    href={step.href}
    className="flex gap-4 bg-surface p-5 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-text"
  >
    {number === undefined ? (
      <Icon name={step.icon} className="mt-0.5 size-4 shrink-0 text-text-3" />
    ) : (
      <span className="mt-px flex size-6 shrink-0 items-center justify-center border border-border-strong font-display text-sm text-text-2">
        {number}
      </span>
    )}
    <span className="flex flex-col gap-1.5">
      <span className="font-display text-base font-medium text-text">{step.title}</span>
      <span className="font-prose text-sm leading-[1.55] text-text-2">{step.body}</span>
      <span className="font-prose text-xs leading-[1.5] text-text-3">{step.needs}</span>
    </span>
  </Link>
)

/**
 * Where a first-time visitor lands, and the only page that has to answer "what do I do now".
 *
 * `registry.caplane.xyz` has one job, so it goes straight to the lookup instead of asking a visitor
 * to find it among the rest.
 */
export default async function Page({ params }: PageProps<'/[mode]'>) {
  const { mode } = await params
  if (mode === 'paper') redirect('/registry')

  return (
    <main className="flex-1 py-14">
      <p className="font-display text-[10px] font-medium tracking-[0.22em] text-text-3 uppercase">
        Arc Testnet
      </p>
      <h1 className="mt-4 max-w-[22ch] font-display text-3xl leading-[1.2] font-medium tracking-[-0.03em] text-balance text-text sm:text-4xl">
        Pledge a receivable, and prove nobody else already has.
      </h1>
      <p className="mt-5 max-w-2xl font-prose leading-[1.6] text-pretty text-text-2">
        You give an unpaid invoice as collateral; this records that it is taken, without publishing
        what it is. Nothing you type leaves your browser unencrypted.
      </p>

      <section className="mt-12">
        <h2 className="font-display text-[10px] font-medium tracking-[0.22em] text-text-3 uppercase">
          Start here · financing a receivable
        </h2>
        <div className="mt-4 grid gap-px border border-border bg-border">
          {STEPS.map((step, index) => (
            <Card key={step.href} step={step} number={index + 1} />
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-[10px] font-medium tracking-[0.22em] text-text-3 uppercase">
          Or, if that is not why you are here
        </h2>
        <div className="mt-4 grid gap-px border border-border bg-border sm:grid-cols-3">
          {ELSEWHERE.map((step) => (
            <Card key={step.href} step={step} />
          ))}
        </div>
      </section>

      <p className="mt-12 max-w-2xl font-prose text-sm leading-[1.65] text-text-3">
        Just looking?{' '}
        <Link
          href="/registry"
          className="text-text-2 underline underline-offset-4 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
        >
          Checking a lien
        </Link>{' '}
        needs nothing from you — no account and no wallet — and it reads the chain from your own
        browser.
      </p>
    </main>
  )
}
