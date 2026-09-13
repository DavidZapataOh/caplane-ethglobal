import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const CODE_FENCE = /```ts\n([\s\S]*?)```/
const SCRIPTS_DOCS_DIR = dirname(fileURLToPath(import.meta.url))

/**
 * Runs the quickstart's own `ts` fence exactly as printed, so the shown example cannot drift
 * from the one under test. A function body cannot hold a static `import`, so import lines are
 * hoisted above the wrapper; the fence's last non-blank line must be a `const NAME = ...`
 * assignment, which becomes the wrapper's return value. The wrapper is written to a real file
 * under `scripts/docs/` (not a data: URL) so the bare `caplane-sdk` import resolves through this
 * package's own `node_modules`.
 */
export const extractExample = (mdxPathFromHere: string) => {
  const mdxPath = join(SCRIPTS_DOCS_DIR, mdxPathFromHere)
  const fence = readFileSync(mdxPath, 'utf8').match(CODE_FENCE)
  if (!fence) throw new Error(`no ts code fence found in ${mdxPath}`)

  const lines = fence[1]!.split('\n')
  const imports = lines.filter((line) => line.startsWith('import '))
  const body = lines.filter((line) => !line.startsWith('import '))
  const result = body
    .filter((line) => line.trim() !== '')
    .at(-1)
    ?.match(/^const\s+(\w+)\s*=/)
  if (!result) throw new Error(`the example's last line must be a const assignment, in ${mdxPath}`)

  const wrapper = [
    ...imports,
    '',
    'export default async (borrower) => {',
    ...body,
    `  return ${result[1]}`,
    '}',
    '',
  ].join('\n')

  return async (borrower: string) => {
    const tmpPath = join(SCRIPTS_DOCS_DIR, `.quickstart-example.${process.pid}.mjs`)
    writeFileSync(tmpPath, wrapper)
    try {
      const { default: run } = await import(pathToFileURL(tmpPath).href)
      return run(borrower)
    } finally {
      unlinkSync(tmpPath)
    }
  }
}
