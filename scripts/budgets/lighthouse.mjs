// scripts/budgets/lighthouse.mjs
import lighthouse from 'lighthouse'
import * as chromeLauncher from 'chrome-launcher'

const AUDITS = {
  lcpMs: 'largest-contentful-paint',
  clsScore: 'cumulative-layout-shift',
  tbtMs: 'total-blocking-time',
}

/**
 * Reads the three audits by id rather than trusting category scores, which are 0-1 weighted
 * composites and not the metric itself.
 *
 * Three ways this refuses rather than reports. A missing audit throws, because a default of zero
 * clears every budget and looks like a perfect page. An audit present with no `numericValue`
 * throws too — measured: a URL Chrome cannot reach still answers with the audits in place and the
 * numbers absent, and `JSON.stringify` silently drops those keys, so the run prints a result with
 * no metrics in it and passes. And a run Lighthouse itself flags as failed throws before any of
 * that, because its own verdict outranks whatever is left in the object.
 */
export const metricsOf = (lhr) => {
  if (lhr.runtimeError !== undefined) {
    throw new Error(`lighthouse could not measure the page: ${lhr.runtimeError.code}`)
  }
  const out = {}
  for (const [key, auditId] of Object.entries(AUDITS)) {
    const audit = lhr.audits[auditId]
    if (audit === undefined) throw new Error(`lighthouse result has no audit: ${auditId}`)
    if (typeof audit.numericValue !== 'number') {
      throw new Error(`lighthouse audit carried no number: ${auditId}`)
    }
    out[key] = audit.numericValue
  }
  return out
}

export const evaluate = (metrics, budget) => {
  const found = []
  for (const key of Object.keys(AUDITS)) {
    if (metrics[key] > budget[key]) {
      found.push(`${key} ${metrics[key]} exceeds the budget of ${budget[key]}`)
    }
  }
  return found
}

if (import.meta.main) {
  const [url] = process.argv.slice(2)
  const flags = process.argv.slice(3)
  const flagOf = (name) => {
    const hit = flags.find((f) => f.startsWith(`--${name}=`))
    return hit === undefined ? undefined : hit.slice(name.length + 3)
  }
  const chromeFlags = ['--headless=new', '--no-sandbox']
  const resolverRules = flagOf('host-resolver-rules')
  if (resolverRules !== undefined) chromeFlags.push(`--host-resolver-rules=${resolverRules}`)

  const chrome = await chromeLauncher.launch({ chromePath: process.env.CHROME_PATH, chromeFlags })
  try {
    const result = await lighthouse(url, { port: chrome.port, onlyCategories: ['performance'] })
    const metrics = metricsOf(result.lhr)
    console.log(JSON.stringify({ url, ...metrics }))
    const budget = {
      lcpMs: Number(flagOf('budget-lcp') ?? Infinity),
      clsScore: Number(flagOf('budget-cls') ?? Infinity),
      tbtMs: Number(flagOf('budget-tbt') ?? Infinity),
    }
    const found = evaluate(metrics, budget)
    for (const line of found) console.error(`lighthouse: ${line}`)
    if (found.length > 0) process.exit(1)
  } finally {
    await chrome.kill()
  }
}
