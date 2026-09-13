type Environment = Record<string, string | undefined>

/**
 * The ledger reads one execution spends: an access token and the invoice itself. Both are made
 * fresh every run — the enclave has nowhere to keep a token between executions — so the number is
 * per attempt and not per day.
 */
export const LEDGER_CALLS_PER_ATTEMPT = 2

/** 96 attempts a day against a 5,000-a-day tenant, leaving the quota to the people using it. */
const DEFAULT_INTERVAL_MS = 900_000

/**
 * How long the worker sleeps between attempts.
 *
 * Derived, not chosen. The scaffold shipped with sixty seconds, which is 1,440 attempts and 2,880
 * ledger reads a day — more than half the tenant's allowance, spent by a demonstration, against
 * the same quota a person needs to pledge a real receivable.
 */
export const intervalMs = (env: Environment): number => {
  const declared = env.HARNESS_INTERVAL_MS
  if (declared === undefined) return DEFAULT_INTERVAL_MS
  const parsed = Number(declared)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('HARNESS_INTERVAL_MS must be a positive number of milliseconds')
  }
  return parsed
}

/**
 * How many attempts before the worker stops, or undefined for a worker that never stops.
 *
 * Absent and zero both mean no cap, and the asymmetry is deliberate: read as a cap, zero would end
 * the process after nothing, and the restart policy would bring it straight back — a crash loop
 * indistinguishable from a healthy harness until someone reads the logs.
 */
export const iterationCap = (env: Environment): number | undefined => {
  const declared = env.HARNESS_ITERATIONS
  if (declared === undefined) return undefined
  const parsed = Number(declared)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('HARNESS_ITERATIONS must be a non-negative integer')
  }
  return parsed === 0 ? undefined : parsed
}
