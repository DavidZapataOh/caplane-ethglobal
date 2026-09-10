import { Icon } from '../../components/icon'

export default function Page() {
  return (
    <main className="flex-1 p-8 font-data text-text-2">
      <h1 className="font-display text-text text-2xl">Caplane</h1>
      <p className="mt-2 flex items-center gap-2 text-seal-text">
        <Icon name="encumbered" />
        An encrypted lien registry writable only from inside a TEE.
      </p>
    </main>
  )
}
