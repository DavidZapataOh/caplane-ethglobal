import { Landing } from '../../components/landing'

export default async function Page({ params }: PageProps<'/[mode]'>) {
  const { mode } = await params
  if (mode === 'paper') {
    // Sprint-06/02 replaces this with the documentation site.
    return (
      <main className="flex-1 p-8 font-data text-text-2">
        <h1 className="font-display text-text text-2xl">Caplane docs</h1>
        <p className="mt-2">Coming soon.</p>
      </main>
    )
  }
  return <Landing />
}
