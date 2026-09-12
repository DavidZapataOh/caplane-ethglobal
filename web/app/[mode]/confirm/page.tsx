import { Sign } from './sign'

/**
 * The shell stays a server component with no data and no request-time API, so both trees keep
 * prerendering. Reading the host here instead of in the proxy would opt the whole route out.
 */
export default function Page() {
  return (
    <main className="flex-1 p-8 font-data text-text-2">
      <h1 className="font-display text-text text-2xl">Confirm a pledge</h1>
      <p className="mt-3 max-w-prose font-prose">
        A lender has been named as creditor on a receivable owed by you. Read the exact figures
        below and sign them, or close this page. Signing confirms these terms and this creditor —
        nothing else, and nothing open-ended.
      </p>
      <Sign />
    </main>
  )
}
