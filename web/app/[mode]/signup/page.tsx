import { Signup } from './signup'

export default function Page() {
  return (
    <main className="flex-1 p-8 font-data text-text-2">
      <h1 className="font-display text-text text-2xl">Create an organization</h1>
      <p className="mt-2 max-w-prose font-prose text-text-2">
        An organization wallet on Arc, with a treasury policy attached before it holds anything.
      </p>
      <Signup />
    </main>
  )
}
