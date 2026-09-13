import { Lookup } from './lookup'

const FACTS = [
  ['no account', 'and no key'],
  ['68,097 gas', 'to ask by transaction'],
  ['~12 s', 'to a verdict'],
  ['0 servers', 'of ours in the path'],
] as const

/**
 * The shell is a server component with no data and no request-time API, so both trees keep
 * prerendering. The proxy decides which palette a host reaches; reading the host here would opt the
 * whole route out.
 */
export default function Page() {
  return (
    <main className="flex-1 py-16">
      <p className="font-display text-[10px] font-medium tracking-[0.22em] text-text-3 uppercase">
        Public lookup · Arc Testnet
      </p>
      <h1 className="mt-5 max-w-[18ch] font-display text-4xl leading-[1.15] font-medium tracking-[-0.03em] text-balance text-text sm:text-5xl">
        Is this receivable already pledged?
      </h1>
      <p className="mt-6 max-w-2xl font-prose text-lg leading-[1.6] text-pretty text-text-2">
        Paste a lien id to read its state, or a borrower address to see everything recorded against
        them. Your browser reads the chain directly: no account, no key, and no server of ours in the
        path — switch every service we run off and this page answers the same.
      </p>

      <Lookup />

      <dl className="mt-14 grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4">
        {FACTS.map(([figure, caption]) => (
          <div key={figure} className="bg-surface p-5">
            <dt className="font-display text-xl font-medium tracking-[-0.02em] text-text">
              {figure}
            </dt>
            <dd className="mt-1 font-prose text-sm leading-[1.5] text-text-3">{caption}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-20 border-t border-border pt-10">
        <h2 className="max-w-[24ch] font-display text-2xl leading-[1.25] font-medium tracking-[-0.02em] text-text">
          If you hold a receivable and no lien id
        </h2>
        <p className="mt-5 max-w-2xl font-prose leading-[1.65] text-text-2">
          That question cannot be answered here, and pretending otherwise would be the useful lie.
          The registry key is salted with a secret that never leaves the enclave, so holding the
          document tells you nothing about whether it is pledged.
        </p>
        <p className="mt-4 max-w-2xl font-prose leading-[1.65] text-text-2">
          The fuzzy question — “is this one already taken?” — is answered by submitting a sealed
          claim to the inbox: permissionless, but by transaction. It needs a confirmation signed by
          the debtor naming you as creditor, and the enclave answers only by recording or refusing.
          Asking is attempting to register.
        </p>
      </section>
    </main>
  )
}
