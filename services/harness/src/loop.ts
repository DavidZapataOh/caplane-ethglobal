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

import { writeFile } from 'node:fs/promises'
import { attempt } from './attempt.ts'
import { registryAnswers, rpc, statusOf } from './chain.ts'
import { classify } from './classify.ts'
import { type Journal, empty, record, render } from './journal.ts'
import { intervalMs, iterationCap } from './knobs.ts'
import { loadTarget } from './target.ts'
import { awaitVerdict } from './verdict.ts'

const INTERVAL_MS = intervalMs(process.env)
const CAP = iterationCap(process.env)
const JOURNAL_PATH = process.env.HARNESS_JOURNAL_PATH

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Validated before the first attempt, never inside the loop. A target missing a field fails the
// same way on every iteration, and discovering that after a hundred refusals would mean a hundred
// refusals that said nothing about the registry.
const target = loadTarget(process.env)

let journal: Journal = empty()

const iterate = async () => {
  const head = BigInt((await rpc('eth_blockNumber', [])) as string)
  const { submissionId, hash } = await attempt(target)
  const verdict = await awaitVerdict(submissionId, head)

  // Both readings are taken after the verdict and from this process, never inferred from the
  // refusal itself. The registry publishes one reason code for a lien that is really there and for
  // a registry that could not be read, and only these two tell them apart.
  const [lienStatus, answers] = await Promise.all([statusOf(target.lienId), registryAnswers()])
  const outcome = classify({ submissionId, verdict, lienStatus, registryAnswers: answers })

  journal = record(journal, outcome)
  console.log(`${outcome.kind} ${submissionId} tx ${hash}`)

}

const writeJournal = async () => {
  if (JOURNAL_PATH === undefined) return
  try {
    await writeFile(JOURNAL_PATH, render(journal))
  } catch (error) {
    // A journal with nothing decided yet refuses to render rather than invent a rate. That is
    // the correct behaviour on the first iteration and must not end the run.
    console.error(`journal not written: ${String(error)}`)
  }
}

let done = 0
while (CAP === undefined || done < CAP) {
  try {
    await iterate()
  } catch (error) {
    // A transient failure must not end the experiment. The restart policy is the backstop,
    // but a caught error keeps the same process going instead of relying on it.
    console.error(`iteration failed: ${String(error)}`)
  }
  await writeJournal()
  done += 1
  if (CAP !== undefined && done >= CAP) break
  await sleep(INTERVAL_MS)
}

// Written once more on the way out. Measured: a bounded run recorded nine of the ten attempts the
// chain holds, because the last write happened inside an iteration that did not reach it. A record
// that is short by one is worse than no record — it is a number someone would quote.
await writeJournal()
