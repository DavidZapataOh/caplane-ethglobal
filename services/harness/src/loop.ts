/**
 * A worker, not a scheduled job. A scheduled run that is still alive when the next one is due
 * gets skipped, so a permanent loop under a scheduler would run once and silently skip
 * everything after it.
 *
 * The sleep is not a nicety. Billing is per vCPU-minute, so a loop that never yields pins a
 * core and costs roughly ten times the rest of the deployment put together — and the hard
 * spend limit is destructive: reaching it shuts down every workload, the public surfaces
 * included.
 */
export {} // top-level await requires this file to be a module

const INTERVAL_MS = Number(process.env.HARNESS_INTERVAL_MS ?? 60_000)

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const iterate = async () => {
  // Replaced by the adversarial run itself. Until then the loop proves the shape: it stays
  // alive, it yields between iterations, and it restarts without a domain or a port.
  console.log(`harness alive ${new Date().toISOString()}`)
}

while (true) {
  try {
    await iterate()
  } catch (error) {
    // A transient failure must not end the experiment. The restart policy is the backstop,
    // but a caught error keeps the same process going instead of relying on it.
    console.error(`iteration failed: ${String(error)}`)
  }
  await sleep(INTERVAL_MS)
}
