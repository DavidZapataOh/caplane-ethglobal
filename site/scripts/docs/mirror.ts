import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SCRIPTS_DOCS_DIR = import.meta.dirname

/**
 * Copies a source file into a doc page verbatim, so the two can never read differently. A missing
 * source is not a failure: `THREATMODEL.md` and `RELATED-WORK.md` are written by later plans, and
 * this mirror runs on whatever exists today.
 */
export const mirror = (
  sourcePathFromHere: string,
  targetPathFromHere: string,
  title: string,
): 'written' | 'skipped' => {
  const sourcePath = join(SCRIPTS_DOCS_DIR, sourcePathFromHere)
  if (!existsSync(sourcePath)) return 'skipped'
  const body = readFileSync(sourcePath, 'utf8')
  writeFileSync(
    join(SCRIPTS_DOCS_DIR, targetPathFromHere),
    `---\ntitle: ${title}\n---\n\n<!-- generated from ${sourcePathFromHere}, do not edit -->\n\n${body}`,
  )
  return 'written'
}

/** The body of one `## <heading>` section, up to the next `## ` heading or the end of the file. */
const extractSection = (source: string, heading: string): string | undefined =>
  source.match(new RegExp(`^## ${heading}\\n([\\s\\S]*?)(?=\\n## |$)`, 'm'))?.[1]?.trim()

/**
 * Same as `mirror`, but for a single section of a source file rather than the whole thing — the
 * README's limitations section lives alongside content this doc site does not mirror. Skips when
 * the source is missing, and skips just as safely when the source exists but the section hasn't
 * been written into it yet.
 */
export const mirrorSection = (
  sourcePathFromHere: string,
  heading: string,
  targetPathFromHere: string,
  title: string,
): 'written' | 'skipped' => {
  const sourcePath = join(SCRIPTS_DOCS_DIR, sourcePathFromHere)
  if (!existsSync(sourcePath)) return 'skipped'
  const body = extractSection(readFileSync(sourcePath, 'utf8'), heading)
  if (body === undefined) return 'skipped'
  writeFileSync(
    join(SCRIPTS_DOCS_DIR, targetPathFromHere),
    `---\ntitle: ${title}\n---\n\n<!-- generated from ${sourcePathFromHere}#${heading}, do not edit -->\n\n${body}\n`,
  )
  return 'written'
}
