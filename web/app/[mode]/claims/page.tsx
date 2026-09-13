import { Claims } from './claims'

export default function Page() {
  return (
    <main className="flex-1 p-8 font-data text-text-2">
      <h1 className="font-display text-text text-2xl">Your claims</h1>
      <p className="mt-2 max-w-prose font-prose text-text-2">
        Read from the chain, not from a service of ours. Switching every server we run off does not
        change a word of what this page says.
      </p>
      <Claims />
    </main>
  )
}
