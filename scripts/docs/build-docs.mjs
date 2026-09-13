/**
 * Writes the two documents from the data that the tests hold to account.
 *
 * Generated rather than hand-written for one reason: a test over the data can assert that every
 * closure names a line that exists and carries the guard it claims, which is a property no amount
 * of careful prose keeps true through a refactor.
 */
import { writeFileSync } from 'node:fs'
import { renderThreatModel } from './threat-model.ts'
import { renderRelatedWork } from './related-work.ts'

const NOTE = '\n\n<!-- Generated from scripts/docs/. Edit the data there, not this file. -->\n'

const documents = [
  ['../../THREATMODEL.md', renderThreatModel()],
  ['../../RELATED-WORK.md', renderRelatedWork()],
]

for (const [path, body] of documents) {
  const target = new URL(path, import.meta.url)
  writeFileSync(target, `${body}${NOTE}`)
  console.log(`wrote ${target.pathname.split('/').slice(-1)[0]}, ${body.length} bytes`)
}
