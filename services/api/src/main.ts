import { createIndex } from './index-state.js'
import { createApi } from './server.js'

const port = Number(process.env.PORT)
if (!Number.isFinite(port) || port === 0) throw new Error('PORT is not set')
const interval = Number(process.env.POLL_INTERVAL_MS ?? 5_000)

const index = createIndex()
createApi(index).listen(port)

/**
 * The listener binds before the backfill finishes: the platform will not consider a deploy healthy
 * for a process that binds no port, and a cold rebuild takes longer than its grace period. Until
 * it finishes, `stale` and `lagBlocks` say so rather than the feed pretending to be current.
 */
const tick = async () => {
  try {
    await index.backfill()
  } catch (error) {
    console.error(`index: ${String(error)}`)
  }
  setTimeout(tick, interval)
}
void tick()
