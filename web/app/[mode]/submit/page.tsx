import { Submit } from './submit'

export default function Page() {
  return (
    <main className="flex-1 p-8 font-data text-text-2">
      <h1 className="font-display text-text text-2xl">Submit a claim</h1>
      <p className="mt-2 max-w-prose font-prose text-text-2">
        The claim is sealed in this browser with the enclave&apos;s public key. Nothing here sends a
        field of it in the clear, and no service of ours holds the key that opens it.
      </p>
      <Submit />
    </main>
  )
}
