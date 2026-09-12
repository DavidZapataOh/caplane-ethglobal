/**
 * Measures the JavaScript a route actually serves, from the built artifact.
 *
 * Not from a manifest: Next 16 with Turbopack emits hashed chunks and no route-to-chunk manifest,
 * and a measurement that depends on an internal file format breaks silently on the next minor. The
 * prerendered HTML is the contract with the browser, so what it references is what a visitor
 * downloads, and that is what gets counted — gzipped, because that is what crosses the wire.
 *
 *   node scripts/budgets/first-load.mjs web/.next paper/registry
 *   node scripts/budgets/first-load.mjs web/.next paper/registry --against paper --budget 8000
 *
 * With `--against` it reports the delta over another route, and with `--budget` it exits 1 when the
 * delta is over. That comparison lives here rather than in the budgets checker because the checker
 * is hermetic and never builds Next, while this runs in the job that has the artifact — a number
 * reported by a job that cannot fail on it is a number nothing enforces.
 */
import { gzipSync } from 'node:zlib'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const [root, route] = args
const against = args.includes('--against') ? args[args.indexOf('--against') + 1] : undefined
const budget = args.includes('--budget') ? Number(args[args.indexOf('--budget') + 1]) : undefined
if (root === undefined || route === undefined) {
  console.error('usage: first-load.mjs <.next dir> <route> [--against <route>] [--budget <bytes>]')
  process.exit(2)
}

const weigh = (name) => {
  const html = readFileSync(join(root, 'server/app', `${name}.html`), 'utf8')
  const unique = [...new Set([...html.matchAll(/\/_next\/(static\/[^"']+?\.js)/g)].map((found) => found[1]))]
  if (unique.length === 0) {
    console.error(`no scripts referenced by ${name}.html — the measurement would report zero`)
    process.exit(1)
  }
  let raw = 0
  let gzip = 0
  for (const file of unique) {
    const path = join(root, file)
    statSync(path)
    const bytes = readFileSync(path)
    raw += bytes.length
    gzip += gzipSync(bytes).length
  }
  return { chunks: unique.length, rawBytes: raw, gzipBytes: gzip }
}

const measured = weigh(route)
const report = { route, ...measured }
if (against !== undefined) {
  const base = weigh(against)
  report.against = against
  report.baselineGzipBytes = base.gzipBytes
  report.deltaGzipBytes = measured.gzipBytes - base.gzipBytes
}
console.log(JSON.stringify(report))
if (budget !== undefined && report.deltaGzipBytes !== undefined && report.deltaGzipBytes > budget) {
  console.error(`first load: ${route} adds ${report.deltaGzipBytes} gzipped bytes over ${against}, budget ${budget}`)
  process.exit(1)
}
