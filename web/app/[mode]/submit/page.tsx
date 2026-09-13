import { Submit } from './submit'

export default function Page() {
  return (
    <main className="flex-1 py-14">
      <p className="font-display text-[10px] font-medium tracking-[0.22em] text-text-3 uppercase">
        Step 2 of 3 · financing a receivable
      </p>
      <h1 className="mt-4 max-w-[24ch] font-display text-3xl leading-[1.2] font-medium tracking-[-0.03em] text-balance text-text sm:text-4xl">
        Pledge an invoice as collateral
      </h1>
      <p className="mt-5 max-w-2xl font-prose leading-[1.6] text-pretty text-text-2">
        Three things happen: you enter the invoice, your customer confirms it by email, and your
        browser encrypts and sends it. It takes about fifteen seconds once your customer has signed.
      </p>
      <p className="mt-3 max-w-2xl font-prose text-sm leading-[1.6] text-text-3">
        Nothing you type here is sent in the clear. The invoice is encrypted in this browser, and no
        service of ours holds the key that opens it — not even to read it back to you.
      </p>
      <Submit />
    </main>
  )
}
