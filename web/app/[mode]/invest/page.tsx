import { Invest } from './invest'

export default function Page() {
  return (
    <main className="flex-1 p-8 font-data text-text-2">
      <h1 className="font-display text-text text-2xl">Invest</h1>
      <p className="mt-2 max-w-prose font-prose text-text-2">
        Deposit USDC against advances secured by recorded liens. What you can redeem today is what
        the pool holds in cash — the rest is out on advances that have not been repaid yet.
      </p>
      <Invest />
    </main>
  )
}
