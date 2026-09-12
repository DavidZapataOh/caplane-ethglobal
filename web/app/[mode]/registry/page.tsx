import { Lookup } from './lookup'

/**
 * The shell is a server component with no data and no request-time API, so both trees keep
 * prerendering. The proxy decides which palette a host reaches; reading the host here would opt the
 * whole route out.
 */
export default function Page() {
  return (
    <main className="flex-1 p-8 font-data text-text-2">
      <h1 className="font-display text-text text-2xl">Lien registry</h1>
      <p className="mt-3 max-w-prose font-prose">
        Paste a lien id to read its state, or a borrower address to see everything recorded against
        them. Your browser reads the chain directly: there is no account, no key, and no server of
        ours in the path — switch every service we run off and this page answers the same.
      </p>
      <Lookup />
      <section className="mt-10 max-w-prose font-prose text-text-3">
        <h2 className="font-display text-text-2">If you hold a receivable and no lien id</h2>
        <p className="mt-2">
          That question cannot be answered here, and pretending otherwise would be the useful lie.
          The registry key is salted with a secret that never leaves the enclave, so holding the
          document tells you nothing about whether it is pledged. The fuzzy question — “is this one
          already taken?” — is answered by submitting a sealed claim to the inbox: permissionless,
          but by transaction. Measured, that costs 68,097 gas and about twelve seconds, it needs a
          confirmation signed by the debtor naming you as creditor, and the enclave answers only by
          recording or refusing. Asking is attempting to register.
        </p>
      </section>
    </main>
  )
}
