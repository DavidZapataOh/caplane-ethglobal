import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SCRIPTS_DOCS_DIR = import.meta.dirname

/**
 * MDX compiles to JSX, so an HTML comment is a syntax error there — Fumadocs' compiler rejects
 * `<!-- ... -->` outright. Both source files this mirrors carry one of their own ("Generated
 * from scripts/docs/..."), so the substitution has to survive the round trip, not just the
 * header this module adds.
 */
const toMdxComments = (text: string) => text.replace(/<!--([\s\S]*?)-->/g, '{/*$1*/}')

/**
 * Copies a source file into a doc page verbatim (comment syntax aside), so the two can never read
 * differently. A missing source is not a failure: `THREATMODEL.md` and `RELATED-WORK.md` are
 * written by later plans, and this mirror runs on whatever exists today.
 */
export const mirror = (
  sourcePathFromHere: string,
  targetPathFromHere: string,
  title: string,
): 'written' | 'skipped' => {
  const sourcePath = join(SCRIPTS_DOCS_DIR, sourcePathFromHere)
  if (!existsSync(sourcePath)) return 'skipped'
  const body = toMdxComments(readFileSync(sourcePath, 'utf8'))
  writeFileSync(
    join(SCRIPTS_DOCS_DIR, targetPathFromHere),
    `---\ntitle: ${title}\n---\n\n{/* generated from ${sourcePathFromHere}, do not edit */}\n\n${body}`,
  )
  return 'written'
}

/** The body of one `## <heading>` section, up to the next `## ` heading or the end of the file. */
/**
 * No `m` flag, deliberately. With it, `$` anchors to the end of a LINE rather than the end of the
 * file, so the lazy capture stopped at the first line break and this returned an empty section for
 * every input — invisible until a source finally had the section, because an absent one skips.
 */
export const extractSection = (source: string, heading: string): string | undefined =>
  source.match(new RegExp(`(?:^|\\n)## ${heading}\\n([\\s\\S]*?)(?=\\n## |$)`))?.[1]?.trim()

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
  const section = extractSection(readFileSync(sourcePath, 'utf8'), heading)
  if (section === undefined) return 'skipped'
  const body = toMdxComments(section)
  writeFileSync(
    join(SCRIPTS_DOCS_DIR, targetPathFromHere),
    `---\ntitle: ${title}\n---\n\n{/* generated from ${sourcePathFromHere}#${heading}, do not edit */}\n\n${body}\n`,
  )
  return 'written'
}
