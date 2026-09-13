import { Harness } from './harness'

/**
 * The shell is a server component with no data and no request-time API, so both trees keep
 * prerendering. The proxy decides which palette a host reaches; reading the host here would opt the
 * whole route out.
 */
export default function Page() {
  return (
    <main className="flex-1 p-8 font-data text-text-2">
      <h1 className="font-display text-text text-2xl">Adversarial harness</h1>
      <p className="mt-3 max-w-prose font-prose">
        A worker that tries to pledge the same receivable a second time, continuously, and is
        refused every time. It runs against the deployed registry with its own funded address, and
        nothing here is taken on trust: what a refusal means is checked against the registry
        separately, because the chain publishes one reason code both for a lien that is really
        there and for a registry that could not be read.
      </p>
      <Harness />
    </main>
  )
}
